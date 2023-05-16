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

async function join(files) {
  const src1 = await loadImageFromFileAsync(files[0]);
  const src2 = await loadImageFromFileAsync(files[1]);

  // 元の画像の幅と高さを取得します
  const width = src1.cols;
  const height = src1.rows;

  const y = height / 2 + width * 0.62; // スキルの最終行のTOPらへん
  const wid = width * 0.95;
  const hei = width * 0.11;
  const template = src1.roi(new cv.Rect(0, y, wid, hei));
  destructions.push(template);
  addImage(template, 'テンプレート');

  const result = templateMatching(template, src2);
  console.log(`result`, result);

  // 画像の結合領域を指定
  const roiA = new cv.Rect(0, 0, width, y);
  const roiB = new cv.Rect(0, result.lt.y, width, height - result.lt.y);

  // 結合領域の画像を切り出し
  const imgROI_A = src1.roi(roiA);
  addImage(imgROI_A, '切り抜き範囲1');
  const imgROI_B = src2.roi(roiB);
  addImage(imgROI_B, '切り抜き範囲2');

  // 結合した画像を保存するための空のMatを作成
  const dst = new cv.Mat(
    imgROI_A.rows + imgROI_B.rows,
    imgROI_A.cols,
    imgROI_A.type()
  );

  // 2つの画像を縦に結合する
  imgROI_A.copyTo(dst.rowRange(0, imgROI_A.rows));
  imgROI_B.copyTo(dst.rowRange(imgROI_A.rows, imgROI_A.rows + imgROI_B.rows));

  destructions.push(dst);
  addImage(dst, '結合結果');

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
