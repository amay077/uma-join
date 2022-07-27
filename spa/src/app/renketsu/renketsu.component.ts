import { Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { from } from 'linq';
import { saveAs } from 'file-saver';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Rect, RGBA } from '../logic/types';
import { deltaE } from '../logic/color-diff';
import { drawImage, getPixelsFromRect, loadImage, canvasToBlob, getImageDataFromRect, loadImageAsDataURL } from '../logic/image-func';
import * as pixelmatch from 'pixelmatch';

const fixedImageWidthPx = 300;
const margin = {
  top: 50,
  left: 20,
  right: 100,
  bottom: 50
};
const compareLines = 30;
const deltaTolerance = 15;

type CompareImageResult = {
  index: number;
  diffNum: number;
  matchPercentage: number;
};

async function compareImage(
  scaledImageData1: ImageData, availableRect1: Rect,
  scaledImageData2: ImageData, availableRect2: Rect,
  progressFunc: (index: number, length: number) => Promise<void>): Promise<CompareImageResult> {
  const basePixelLines = getPixelsFromRect(scaledImageData1, availableRect1).select(x=> x.toArray());

  const compareImageData = getImageDataFromRect(scaledImageData2, { ...availableRect2, height: compareLines });

  const width = availableRect2.width;
  const height = compareLines;

  const results = [];
  const actualLineLen = basePixelLines.count() - compareLines
  for (let index = 0; index < basePixelLines.count() - compareLines; index++) {
    if (index % 10 == 0 && progressFunc != null) {
      await progressFunc(index, actualLineLen);
    }

    const baseImageData = getImageDataFromRect(scaledImageData1, { ...availableRect1, y: availableRect1.y + index, height });

    const diffNum = pixelmatch(baseImageData.data, compareImageData.data, null, width, compareLines,
      { threshold: 0.1, includeAA: true, alpha: 0 });
    const matchPercentage = (100 - ((diffNum / (width * height)) * 100))
    results.push({index, diffNum, matchPercentage });
  }


  const min = from(results).minBy(x => x.diffNum);
  return min;
  // return { index: -1 };
}

function genCanvas(width: number, height: number): { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D } {
  const canvas =  document.createElement('canvas');
  const context = canvas.getContext('2d')!;

  canvas.setAttribute('width', `${width}px`);
  canvas.setAttribute('height', `${height}px`);

  return { canvas, context }

}

@Component({
  selector: 'app-renketsu',
  templateUrl: './renketsu.component.html',
  styleUrls: ['./renketsu.component.scss']
})
export class RenketsuComponent implements OnInit {
  app_ver = (window as any)['app_ver'] ?? '';

  processing = false;
  progress = 0;
  images: { tag: string, image: string }[] = [];
  imageSrc = '';
  accuracy = '12';
  reorder = true;

  showDetails = false;

  files: File[] = [];
  private imageBlob: Blob | null = null;

  constructor(router: Router, activatedRoute: ActivatedRoute, private toast: ToastrService, private ngZone: NgZone) {
    router.routeReuseStrategy.shouldReuseRoute = () => false;

    if (activatedRoute.snapshot.queryParamMap.has('eruda')) {
      const eruda = require('eruda');
      eruda.init();
    }

    const settingsStr = localStorage.getItem('settings');
    if (settingsStr != null) {
      const settingsJson = JSON.parse(settingsStr);
      this.accuracy = settingsJson.accuracy;
    }
  }

  ngOnInit(): void { }

  async onJoin() {
    this.progress = 0;
    this.processing = true;
    this.imageBlob = null;
    this.imageSrc = '';
    this.images = [];

    try {
      const start = new Date();

      // 全画像読み込み＆リサイズ
      const images = await Promise.all(
        this.files.map(file => loadImage(file, fixedImageWidthPx)
          .then(img => {
            // 処理対象領域(マージンを除いた領域)
            const withoutMarginRect = {
              x: margin.left,
              y: margin.top,
              width: img.scaledImageData.width - margin.right - margin.left,
              height: img.scaledImageData.height - margin.bottom - margin.top
            };

            return { img, withoutMarginRect };
          })
        )
      );

      // 経過に追加
      images.forEach(({ img, withoutMarginRect }, index) => {
        const { canvas, context } = genCanvas(img.scaledImageData.width, img.scaledImageData.height)
        drawImage(context, img.scaledImageData, { x: 0, y: 0 }, { x: 0, y: 0, width: img.scaledImageData.width, height: img.scaledImageData.height });
        context.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        context.lineWidth = 4;
        context.strokeRect(withoutMarginRect.x, withoutMarginRect.y, withoutMarginRect.width, withoutMarginRect.height);

        this.images.push({ tag:`1_画像${index}の処理対象枠`, image: canvas.toDataURL('image/png') });
      });


      // 経過に追加
      {
        const img1 = images[0].img.scaledImageData;
        const img2 = images[1].img.scaledImageData;
        const width = img1.width;
        const height = img1.height;
        const { canvas, context } = genCanvas(width, height);
        const diff = context.createImageData(width, height);
        const ret = pixelmatch(img1.data, img2.data, diff.data, width, height, {threshold: 0.1, includeAA: true, alpha: 0});
        const firstDiff = diff.data.findIndex(x => {
          return x != 255;
        });
        console.log(`${this.constructor.name} ~ onJoin ~ ret`, ret);
        drawImage(context, diff, { x: 0, y: 0 }, { x: 0, y: 0, width, height });
        this.images.push({ tag:'2_画像0と1の差分画像', image: canvas.toDataURL('image/png') });
      }

      this.progress = 10;

      const isSameSize = from(images)
        .select(x => x.img.scaledImageData)
        .pairwise((a,b) => a.width == b.width)
        .all(x => x);
      if (!isSameSize) {
        this.toast.warning('画像ファイルは同じ幅にしてください');
        return;
      }

      // 先頭2つの画像の、
      // 上部の共通領域と下部の共通領域の高さと、
      // それを除いた各画像の領域を取得
      const { sameTopNum, sameLastNum, availables } = (() => {
        const lineColorComparer = (x: {l: RGBA[], r: RGBA[]}) => {
          const sames = from(x.l).zip(x.r, (a, b) => {
            const d = deltaE(a, b);
            return d;
          }).where(delta => delta < deltaTolerance).count();
          return sames / x.l.length;
        };

        const pixelsA = getPixelsFromRect(images[0].img.scaledImageData, images[0].withoutMarginRect);
        const pixelsB = getPixelsFromRect(images[1].img.scaledImageData, images[1].withoutMarginRect);

        const zipedLines = pixelsA.zip(pixelsB, (l, r) => ({l: l.toArray(), r: r.toArray()}));
        const sameTopNum = zipedLines.select(lineColorComparer).takeWhile(ave => ave > 0.8).count() + 10;
        const sameLastNum = zipedLines.reverse().select(lineColorComparer).takeWhile(ave => ave > 0.8).count();

        const availables = images.map((x) => {
          const availableRect = {
            x: x.withoutMarginRect.x,
            y: x.withoutMarginRect.y + sameTopNum,
            width: x.withoutMarginRect.width,
            height: x.withoutMarginRect.height - sameLastNum - sameTopNum
          };
          return { ...x, availableRect };
        })

        return { sameTopNum, sameLastNum, availables }
      })();

      // 経過に追加
      availables.forEach(({ img, availableRect }, index) => {
        const { canvas, context } = genCanvas(img.scaledImageData.width, img.scaledImageData.height);
        drawImage(context, img.scaledImageData, { x: 0, y: 0 }, { x: 0, y: 0, width: img.scaledImageData.width, height: img.scaledImageData.height });
        context.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        context.lineWidth = 4;
        context.strokeRect(availableRect.x, availableRect.y, availableRect.width, availableRect.height);
        this.images.push({ tag: `3_画像${index}の上部下部共通部を除いた領域` , image: canvas.toDataURL('image/png') });
      });

      const { offsets, totalHeight } = await (async () => {
        const ignoreTopPx = sameTopNum + margin.top;

        const compareResults = [];
        const progressDivision = (90 - 10) / (images.length - 1);
        for (let i = 0; i < images.length - 1; i++) {
          const j = i + 1;
          const image1 = images[i];
          const image2 = images[j];
          const availables1 = availables[i];
          const availables2 = availables[j];

          const min1 = await compareImage(
            image1.img.scaledImageData, availables1.availableRect,
            image2.img.scaledImageData, availables2.availableRect,
            async (index, actualLineLen) => {
              this.progress = 10 + (progressDivision * i) + Math.ceil((index / actualLineLen) * progressDivision);
              return new Promise(resolve => setTimeout(resolve, 10));
            });

          compareResults.push({...min1, images: [image1, image2]});
        }

        this.progress = 90;
        await new Promise(resolve => setTimeout(resolve, 10));

        const offsets = compareResults.reduce((pre, cur, index) => {
          if (index == 0) {
            // 最初の画像は y:0 から
            pre.push({ image: cur.images[0].img, y: 0, height: ignoreTopPx + cur.index })
          } else {
            // 2番目以降は、y:共通部TOP から
            pre.push({ image: cur.images[0].img, y: ignoreTopPx, height: cur.index })
          }

          // 最後の画像は height:画像の終端まで
          if ( index == compareResults.length - 1 ) {
            pre.push({ image: cur.images[1].img, y: ignoreTopPx, height: cur.images[1].img.scaledImageData.height - ignoreTopPx  })
          }
          return pre;
        }, [] as { image: {
          imageData: ImageData;
          scaledImageData: ImageData;
          scale: number;
        }, y: number, height: number }[])

        const totalHeight = offsets.reduce((pre, cur) => pre + cur.height, 0);

        return { offsets, totalHeight };
      })();

      // 経過に追加
      offsets.forEach((offset, index) => {
        const imageData = offset.image.scaledImageData;
        const { canvas, context} = genCanvas(imageData.width, imageData.height)
        drawImage(context, imageData, { x: 0, y: 0 }, { x: 0, y: 0, width: imageData.width, height: imageData.height});

        const availableRect = {
          x: 5,
          y: offset.y,
          width: imageData.width - 10,
          height: offset.height
        };
        context.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        context.lineWidth = 4;
        context.strokeRect(availableRect.x, availableRect.y, availableRect.width, availableRect.height);

        this.images.push({ tag:`4_画像${index}の採用領域`, image: canvas.toDataURL('image/png') });
      });

      // 最終結果出力
      {
        const scale = offsets[0].image.scale;
        const { canvas, context } = genCanvas(offsets[0].image.imageData.width, totalHeight / scale);

        let srcY = 0;
        for (const offset of offsets) {
          drawImage(context, offset.image.imageData,
            { x: 0, y: srcY },
            { x: 0, y: offset.y / scale, width: offset.image.imageData.width, height: offset.height / scale });
          srcY += (offset.height / scale);
        }
        this.imageSrc = canvas.toDataURL('image/png');
        this.imageBlob = await canvasToBlob(canvas, 'image/png');
      }

      localStorage.setItem('settings', JSON.stringify({ accuracy: this.accuracy }));
      this.progress = 100;
      const end = new Date();
      const duration = end.getTime() - start.getTime();
      console.log(`${this.constructor.name} ~ convert duration ${duration}ms`, );

    } catch (error) {
      console.log(`${this.constructor.name} ~ onJoin ~ error`, error);
    } finally {
      this.processing = false;
    }
  }

  get canShare(): boolean {
    return navigator?.share != null;
  }

  async onShare() {
    const type = 'image/png';
    const blob = this.imageBlob;
    if (blob == null) {
      console.log(`${this.constructor.name} ~ onShare ~ blob is null`);
      return;
    }

    try {
      const file = new File([blob], "image.png", { type });
      const nav = navigator as any;
      await nav.share({
        text: "#umajoin",
        files: [file]
      });
      console.log("共有成功.");
    } catch (error) {
      console.log(`${this.constructor.name} ~ onShare ~ error`, error);
    }
  }

  async onDownload() {

    const blob = this.imageBlob;
    if (blob == null) {
      console.log(`${this.constructor.name} ~ onDownload ~ blob is null`);
      return;
    }

    try {
      saveAs(blob, `image-${new Date().toISOString()}.png`);
    } catch (error) {
      console.log(`${this.constructor.name} ~ onShare ~ error`, error);
    }
  }
}


/**
 * 画像付きでWebページを共有する
 */
 const share = () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const dataURL = canvas.toDataURL("image/png");
  const blob = toBlob(dataURL)!;

  const imageFile = new File([blob], "image.png", {
    type: "image/png",
  });
  (navigator as any).share({
    text: "#umajoin",
    files: [imageFile],
  }).then(() => {
    console.log("共有成功.");
  }).catch((error: any) => {
    console.log(error);
  });
};

/**
 * Base64形式の画像データをBlobに変換する
 * @param {String} base64 Base64形式の画像データ
 * @returns {Blob} Blob形式の画像データ
 */
const toBlob = (base64: string) => {
  const decodedData = atob(base64.replace(/^.*,/, ""));
  const buffers = new Uint8Array(decodedData.length);
  for (let i = 0; i < decodedData.length; i++) {
    buffers[i] = decodedData.charCodeAt(i);
  }
  try {
    const blob = new Blob([buffers.buffer], {
      type: "image/png",
    });
    return blob;
  } catch (e) {
    return null;
  }
};
