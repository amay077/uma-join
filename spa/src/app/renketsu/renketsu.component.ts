import { Component, NgZone, OnInit } from '@angular/core';
import { from } from 'linq';
import { saveAs } from 'file-saver';
import { ActivatedRoute, PreloadAllModules, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Rect, RGBA } from './func/types';
import { deltaE } from './func/color-diff';
import { drawImage, getPixelsFromRect, loadImage, canvasToBlob, getImageDataFromRect } from './func/image-func';
// const pixelmatch = require('pixelmatch');
import * as pixelmatch from 'pixelmatch';
import { off } from 'process';

const fixedImageWidthPx = 300;
const margin = {
  top: 50,
  left: 20,
  right: 100,
  bottom: 50
};
const compareLines = 30;
const deltaTolerance = 15;

const isEqualPixels = (a: RGBA[][], b: RGBA[][], tolerance: number): boolean => { //{ min: number, max: number, average: number } => {
  const results = [];
  for (let i = 0; i < a.length; i++) {
    const la = a[i];
    const lb = b[i];

    for (let j = 0; j < la.length; j++) {
      const pa = la[j];
      const pb = lb[j];

      const d = deltaE(pa, pb);
      if (d > tolerance) {
        return false;
      }
    }
  }

  // const r = from(results)
  // return { min: r.min(), max: r.max(), average: r.average() };
  return true;
};

type CompareImageResult = {
  index: number;
  diffNum: number;
  matchPercentage: number;
  // min: number;
  // max: number;
  // average: number;
};
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

  ngOnInit(): void {
    const arr = [2,5,4,3,1];

    const results = arr.reduce((results, a) => {
      const hit = arr.find(b => a + 1 == b);
      if (hit != null) {
        results.push([a, hit]);
      }
      return results;
    }, [] as [number, number][])
    // [2, 3]
    // [4, 5]
    // [3, 4]
    // [1, 2]
    console.log(`${this.constructor.name} ~ ngOnInit ~ results`, results);

    // 仲間はずれ(to に居ない)の from を探す
    let search = from(results).select(r => {
        const hit = results.find(([a, b]) => r[0] == b);
        return !hit ? r[0] : -1;
      }).where(x => x >= 0).firstOrDefault();
    const ordered = [search];
    let foundIndex = results.findIndex(([a, _]) => a == search);;
    while (foundIndex >= 0) {
      const [_, b] = results[foundIndex]
      ordered.push(b);
      search = b;
      results.splice(foundIndex, 1);
      foundIndex = results.findIndex(([a, _]) => a == search);;
    }
    //  [1, 2]
    //  [2, 3]
    //  [3, 4]
    //  [4, 5]
    console.log(`${this.constructor.name} ~ ngOnInit ~ ordered`, ordered);

    // results
  }

  onSelect(event: any) {
    this.files.push(...event.addedFiles);
  }

  onRemove(event: any) {
    this.files.splice(this.files.indexOf(event), 1);
  }

  private async compareImage(
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
      // console.log(`${this.constructor.name}`, index, diffNum, matchPercentage.toFixed(2));
    }


    const min = from(results).minBy(x => x.diffNum);
    return min;
    // return { index: -1 };
  }

  async onJoin() {

    // if (this.files.length != 2) {
    //   this.toast.warning('画像ファイルを2つ選択してください');
    //   return;
    // }

    this.progress = 0;
    this.processing = true;
    this.imageBlob = null;
    this.imageSrc = '';
    this.images = [];

    try {
      const start = new Date();
      const images = await Promise.all(this.files.map(file => loadImage(file, fixedImageWidthPx)));

      const canvases = images.map((image) => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        return { canvas, context, image };
      });

      const withoutMargins = canvases.map(({ canvas, context, image }) => {
        const withoutMarginRect = {
          x: margin.left,
          y: margin.top,
          width: image.scaledImageData.width - margin.right - margin.left,
          height: image.scaledImageData.height - margin.bottom - margin.top
        };
        return { canvas, context, image, withoutMarginRect };
      })

      {
        let index = 0;
        for (const { canvas, context, image, withoutMarginRect } of withoutMargins) {
          canvas.setAttribute('width', `${image.scaledImageData.width}px`);
          canvas.setAttribute('height', `${image.scaledImageData.height}px`);

          drawImage(context, image.scaledImageData, { x: 0, y: 0 }, { x: 0, y: 0, width: image.scaledImageData.width, height: image.scaledImageData.height });

          context.strokeStyle = 'rgba(255, 0, 0, 0.5)';
          context.lineWidth = 4;
          context.strokeRect(withoutMarginRect.x, withoutMarginRect.y, withoutMarginRect.width, withoutMarginRect.height);

          this.images.push({ tag:`1 + ${index}`, image: canvas.toDataURL('image/png') });
          index++;
        }
      }


      const img1 = images[0].scaledImageData;
      const img2 = images[1].scaledImageData;
      const width = img1.width;
      const height = img1.height;

      const diffCanvas = document.createElement('canvas');
      diffCanvas.setAttribute('width', `${width}px`);
      diffCanvas.setAttribute('height', `${height}px`);
      const diffContext = diffCanvas.getContext('2d')!;
      const diff = diffContext.createImageData(width, height);
      const ret = pixelmatch(img1.data, img2.data, diff.data, width, height, {threshold: 0.1, includeAA: true, alpha: 0});
      console.log(`${this.constructor.name} ~ onJoin ~ ret`, ret);
      drawImage(diffContext, diff, { x: 0, y: 0 }, { x: 0, y: 0, width, height });
      this.images.push({ tag:'2', image: diffCanvas.toDataURL('image/png') });

      this.progress = 10;

      const isSameSize = from(images)
        .select(x => x.scaledImageData)
        .pairwise((a,b) => a.width == b.width)
        .all(x => x);
      if (!isSameSize) {
        this.toast.warning('画像ファイルは同じ幅にしてください');
        return;
      }

      const lineColorComparer = (x: {l: RGBA[], r: RGBA[]}) => {
        const sames = from(x.l).zip(x.r, (a, b) => {
          const d = deltaE(a, b);
          return d;
        }).where(delta => delta < deltaTolerance).count();
        return sames / x.l.length;
      };

      const pixelsA = getPixelsFromRect(images[0].scaledImageData, withoutMargins[0].withoutMarginRect);
      const pixelsB = getPixelsFromRect(images[1].scaledImageData, withoutMargins[1].withoutMarginRect);

      const zipedLines = pixelsA.zip(pixelsB, (l, r) => ({l: l.toArray(), r: r.toArray()}));
      const sameTopNum = zipedLines.select(lineColorComparer).takeWhile(ave => ave > 0.8).count() + 10;
      const sameLastNum = zipedLines.reverse().select(lineColorComparer).takeWhile(ave => ave > 0.8).count();

      const availables = withoutMargins.map((x) => {
        const availableRect = {
          x: x.withoutMarginRect.x,
          y: x.withoutMarginRect.y + sameTopNum,
          width: x.withoutMarginRect.width,
          height: x.withoutMarginRect.height - sameLastNum - sameTopNum
        };
        return { ...x, availableRect };
      })

      let index = 0;
      for (const { canvas, context, image, availableRect } of availables) {

        context.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        context.lineWidth = 4;
        context.strokeRect(availableRect.x, availableRect.y, availableRect.width, availableRect.height);

        this.images.push({ tag: `3 + ${index}` , image: canvas.toDataURL('image/png') });
        index++;
      }

      let ignoreTopPx = sameTopNum + margin.top;
      let ignoreBottomPx = sameLastNum + margin.bottom;

      const compareResults = [];
      const progressDivision = (90 - 10) / (images.length - 1);
      for (let i = 0; i < images.length - 1; i++) {
        const j = i + 1;
        const image1 = images[i];
        const image2 = images[j];
        const availables1 = availables[i];
        const availables2 = availables[j];

        const min1 = await this.compareImage(
          image1.scaledImageData, availables1.availableRect,
          image2.scaledImageData, availables2.availableRect,
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
          pre.push({ image: cur.images[0], y: 0, height: ignoreTopPx + cur.index })
        } else {
          // 2番目以降は、y:共通部TOP から
          pre.push({ image: cur.images[0], y: ignoreTopPx, height: cur.index })
        }

        // 最後の画像は height:画像の終端まで
        if ( index == compareResults.length - 1 ) {
          pre.push({ image: cur.images[1], y: ignoreTopPx, height: cur.images[1].scaledImageData.height - ignoreTopPx  })
        }
        return pre;
      }, [] as { image: {
        imageData: ImageData;
        scaledImageData: ImageData;
        scale: number;
      }, y: number, height: number }[])

      const totalHeight = offsets.reduce((pre, cur) => pre + cur.height, 0);

      offsets.forEach((offset, index) => {
        const imageData = offset.image.scaledImageData;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;

        canvas.setAttribute('width', `${imageData.width}px`);
        canvas.setAttribute('height', `${imageData.height}px`);
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

        this.images.push({ tag:`4 + ${index}`, image: canvas.toDataURL('image/png') });
      });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      const scale = offsets[0].image.scale;
      canvas.setAttribute('width', `${offsets[0].image.imageData.width}px`);
      canvas.setAttribute('height', `${totalHeight / scale}px`);

      let srcY = 0;
      for (const offset of offsets) {
        drawImage(context, offset.image.imageData,
          { x: 0, y: srcY },
          { x: 0, y: offset.y / scale, width: offset.image.imageData.width, height: offset.height / scale });
        srcY += (offset.height / scale);
      }
      this.imageSrc = canvas.toDataURL('image/png');
      this.imageBlob = await canvasToBlob(canvas, 'image/png');

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
