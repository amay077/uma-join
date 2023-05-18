const destructions = [];

function loadImageFromFileAsync(file) {
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

async function join(files, options) {
  console.log(`FIXME h_oku 後で消す -> join -> files:`, files);
  no = 1;
  const sources = [];
  for (const file of files) {
    sources.push(await loadImageFromFileAsync(file));
  }

  const results = [];
  let lastCanvas;
  for (let i = 0; i < sources.length - 1; i++) {
    console.log(i, i+ 1);
    lastCanvas = join2(sources[i], sources[i + 1], options, results);
  }
  results.push({ bottom: sources[sources.length - 1].rows });
  console.log(`FIXME h_oku 後で消す -> results:`, results);

  const res = results.reduce((pre, cur) => {
    pre.arr.push({ y: pre.y, height: cur.bottom - pre.y });
    pre.y = cur.top;
    return pre;
  }, { arr: [], y: 0 });
  console.log(`FIXME h_oku 後で消す res -> res:`, res);

  // 結合した画像を保存するための空のMatを作成
  const width = sources[0].cols;
  const dst = new cv.Mat(
    res.arr.reduce((pre, cur) => pre + cur.height, 0),
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

function join2(src1, src2, options, results) {

  // 元の画像の幅と高さを取得します
  const width = src1.cols;
  const height = src1.rows;

  const u = width / 100;
  console.log(`FIXME h_oku 後で消す -> join -> u:`, u);

  // const y = height / 2 + width * options.yPos; // スキルの最終行のTOPらへん
  const y = Math.floor((height / 2) + (u * options.yPos));
  const wid = Math.floor(width * 0.95);
  // const hei = width * options.height;
  const hei = Math.floor(u * options.height);
  console.log(`FIXME h_oku 後で消す -> join -> hei:`, hei);

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

  // // 結合領域の画像を切り出し
  // const imgROI_A = src1.roi(roiA);
  // addImage(imgROI_A, '切り抜き範囲1');
  // const imgROI_B = src2.roi(roiB);
  // addImage(imgROI_B, '切り抜き範囲2');

  results.push({ bottom: y, top: result.lt.y });

  // // 結合した画像を保存するための空のMatを作成
  // const dst = new cv.Mat(
  //   imgROI_A.rows + imgROI_B.rows,
  //   imgROI_A.cols,
  //   imgROI_A.type()
  // );

  // // 2つの画像を縦に結合する
  // imgROI_A.copyTo(dst.rowRange(0, imgROI_A.rows));
  // imgROI_B.copyTo(dst.rowRange(imgROI_A.rows, imgROI_A.rows + imgROI_B.rows));

  // destructions.push(dst);
  // addImage(dst, '結合結果');

  // const canvas = document.createElement('canvas');
  // cv.imshow(canvas, dst);

  // console.log(`finished`);

  // return canvas;
}

function templateMatching(template, target) {
  const dst = new cv.Mat();
  const mask = new cv.Mat();
  destructions.push(...[dst, mask]);

  // テンプレートマッチングを実行
  cv.matchTemplate(template, target, dst, cv.TM_CCOEFF, mask);

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
  cv.rectangle(temp, lt, rb, color, 2, cv.LINE_8, 0);
  addImage(temp, 'テンプレートマッチング結果');

  return { lt, rb };
}


let no = 1;
function addImage(image, label) {
  const divLogs = document.getElementById('logs');
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

window.join = join;
console.log(`stitch.js loaded`);
