declare const cv: any;

const destructions: any[] = [];

function loadImageFromFileAsync(file: File): Promise<any> {
  return new Promise((resolve) => {
    const img = new Image();

    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const mat = cv.imread(img);
      destructions.push(mat);
      resolve(mat);
    };
  });
}

export async function join(files: File[], options: any, refFile: File) {
  console.log(`join -> files:`, files);
  no = 1;
  const sources: any[] = [];
  for (const file of files) {
    sources.push(await loadImageFromFileAsync(file));
  }

  const finderMat = await loadImageFromFileAsync(refFile)
  destructions.push(finderMat);

  const results: { bottom: number, top?: number }[] = [];
  let lastCanvas;
  for (let i = 0; i < sources.length - 1; i++) {
    console.log(i, i+ 1);
    lastCanvas = joinInner(sources[i], sources[i + 1], options, results, finderMat);
  }
  results.push({ bottom: sources[sources.length - 1].rows });
  console.log(`join -> results:`, results);

  const res = results.reduce((pre, cur) => {
    pre.arr.push({ y: pre.y, height: cur.bottom - pre.y });
    pre.y = cur.top ?? 0;
    return pre;
  }, { arr: [], y: 0 } as { arr: { y: number, height: number }[], y: number });
  console.log(`join -> res:`, res);

  // 結合した画像を保存するための空のMatを作成
  const width = sources[0].cols;
  let dst = new cv.Mat(
    res.arr.reduce((pre: any, cur: any) => pre + cur.height, 0),
    width,
    sources[0].type()
  );
  destructions.push(dst);
  const rectColor = new cv.Scalar(255, 0, 0);  // 赤色で矩形を描画します (BGR形式)
  cv.rectangle(dst, new cv.Point(0, 0), new cv.Point(dst.cols, dst.rows), rectColor, cv.FILLED);

  let top = 0;
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const r = res.arr[i];

    const roi = src.roi(new cv.Rect(0, r.y, width, r.height));
    addImage(roi, `結合対象${i}`);
    roi.copyTo(dst.rowRange(top, top + roi.rows));
    top += r.height;
    addImage(dst, `結合中${i}`);
  }

  // 下部を削除
  const resultMatchingBottom = matchingToReferenceBottom(dst, finderMat);
  if (resultMatchingBottom != null && resultMatchingBottom.score > 0.8) {
    console.log(`FIXME 後で消す join -> resultMatching:`, resultMatchingBottom);
    const dstCroped = new cv.Mat(
      resultMatchingBottom.lt.y,
      dst.cols,
      dst.type()
    );
    destructions.push(dstCroped);
    dst.copyTo(dstCroped.rowRange(0, resultMatchingBottom.lt.y));
    addImage(dstCroped, `下部削除結果`);
    dst = dstCroped;
  }

  // 上部を削除
  const resultMatchingTop = matchingToReferenceTop(dst, finderMat);
  if (resultMatchingTop != null && resultMatchingTop.score > 0.8) {
    console.log(`join -> resultMatchingTop:`, resultMatchingTop);
    const dstCroped = new cv.Mat(
      dst.rows - resultMatchingTop.lt.y,
      dst.cols,
      dst.type()
    );
    destructions.push(dstCroped);
    const roi = dst.roi(new cv.Rect(0, resultMatchingTop.lt.y, width, dst.rows - resultMatchingTop.lt.y));
    roi.copyTo(dstCroped.rowRange(0, roi.rows));
    addImage(dstCroped, `上部削除結果`);
    dst = dstCroped;
  }


  const canvas = document.createElement('canvas');
  cv.imshow(canvas, dst);
  console.log(`finished`);

  try {
    for (const x of destructions) {
      x?.delete();
    }
  } catch (error) {}

  return canvas;
}

function matchingToReferenceBottom(srcMat: any, referenceMat: any) {
  try {
    const scale = srcMat.cols / referenceMat.cols;
    const roiReference = referenceMat.roi(new cv.Rect(0, 2000, referenceMat.cols, 200));
    const newHeight = Math.round(roiReference.rows * scale);
    const newWidth = Math.round(roiReference.cols * scale);
    const resizedMat = new cv.Mat();
    destructions.push(resizedMat);
    cv.resize(
      roiReference,
      resizedMat,
      new cv.Size(newWidth, newHeight),
      0,
      0,
      cv.INTER_LINEAR
    );
    addImage(resizedMat, 'リファレンス画像(下)');
    return templateMatching(resizedMat, srcMat, 'リファレンス画像(下)マッチング結果');
  } catch (error) {
    console.log(`FIXME matchingToReferenceBottom -> error:`, error);
    return null;
  }
}

function matchingToReferenceTop(srcMat: any, referenceMat: any) {
  try {
    const scale = srcMat.cols / referenceMat.cols;
    const roiReference = referenceMat.roi(new cv.Rect(0, 350, referenceMat.cols, 100));
    const newHeight = Math.round(roiReference.rows * scale);
    const newWidth = Math.round(roiReference.cols * scale);
    const resizedMat = new cv.Mat();
    destructions.push(resizedMat);
    cv.resize(
      roiReference,
      resizedMat,
      new cv.Size(newWidth, newHeight),
      0,
      0,
      cv.INTER_LINEAR
    );
    addImage(resizedMat, 'リファレンス画像(上)');
    return templateMatching(resizedMat, srcMat, 'リファレンス画像(上)マッチング結果');
  } catch (error) {
    console.log(`matchingToReferenceTop -> error:`, error);
    return null;
  }
}

function joinInner(src1: any, src2: any, options: any, results: { bottom: number, top?: number }[], refMat: any) {

  // 元の画像の幅と高さを取得します
  const width = src1.cols;
  const height = src1.rows;

  const matchingResult = matchingToReferenceBottom(src1, refMat);

  const u = width / 100;

  // const y = height / 2 + width * options.yPos; // スキルの最終行のTOPらへん
  let y = Math.floor((height / 2) + (u * options.yPos));
  const wid = Math.floor(width * 0.95);
  const hei = Math.floor(u * options.height);
  console.log(`joinInner -> hei:`, hei);


  if (matchingResult != null && matchingResult.score > 0.8) {
    y = matchingResult.lt.y - hei;
  }

  // 矩形を描画します
  const rectColor = new cv.Scalar(255, 0, 0);  // 赤色で矩形を描画します (BGR形式)
  const templateRegion = src1.clone();
  destructions.push(templateRegion);
  cv.cvtColor(templateRegion, templateRegion, cv.COLOR_RGBA2RGB);
  cv.rectangle(templateRegion, new cv.Point(0, y), new cv.Point(0 + wid, y + hei), rectColor, 3);
  addImage(templateRegion, 'テンプレート領域');

  const template = src1.roi(new cv.Rect(0, y, wid, hei));
  destructions.push(template);
  // addImage(template, 'テンプレート');

  const result = templateMatching(template, src2);
  console.log(`result`, result);

  // 画像の結合領域を指定
  const roiA = new cv.Rect(0, 0, width, y);
  const roiB = new cv.Rect(0, result.lt.y, width, height - result.lt.y);
  results.push({ bottom: y, top: result.lt.y });
}

function templateMatching(template: any, target: any, comment?: string): { lt: {x: number, y: number}, rb: {x: number, y: number}, score: number } {
  const dst = new cv.Mat();
  const mask = new cv.Mat();
  destructions.push(...[dst, mask]);

  // テンプレートマッチングを実行
  cv.matchTemplate(template, target, dst, cv.TM_CCOEFF_NORMED, mask);

  // 最大/最小のスコアとその位置を取得
  const result = cv.minMaxLoc(dst, mask);

  const lt = result.maxLoc;
  const color = new cv.Scalar(255, 0, 0, 255);
  const rb = new cv.Point(lt.x + template.cols, lt.y + template.rows);
  console.log(`templateMatching -> leftTop:`, lt);
  console.log(`templateMatching -> rightBottom:`, rb);

  // マッチングの結果を視覚化
  const temp = target.clone();
  destructions.push(temp);

  const thickness = 4;
  const thicknessHalf = thickness / 2;
  const ltInset = { x: lt.x + thicknessHalf, y: lt.y + thicknessHalf };
  const rbInset = { x: rb.x - thickness, y: rb.y - thickness };

  cv.rectangle(temp, ltInset, rbInset, color, thickness, cv.LINE_8, 0);
  addImage(temp, (comment ?? 'テンプレートマッチング結果') + `/スコア:${Math.floor(result.maxVal * 100)}`);

  return { lt, rb, score: result.maxVal };
}


let no = 1;
function addImage(image: any, label: string) {
  const divLogs: any = document.getElementById('logs');
  const div = document.createElement('div');
  div.style.cssText = `display: flex; flex-direction: column; width:250px; margin-bottom: 5px;`;

  const span = document.createElement('span');
  span.innerText = `${no}. ${label ?? ''}`;
  div.appendChild(span);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = `width:100%; border: 1px solid black`;
  div.appendChild(canvas);

  divLogs.appendChild(div);
  cv.imshow(canvas, image);
  no++;
}
