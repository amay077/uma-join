import { Component, NgZone, OnInit } from '@angular/core';
import { from } from 'linq';
import { saveAs } from 'file-saver';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Rect, RGBA } from './func/types';
import { deltaE } from './func/color-diff';
import { drawImage, getPixelsFromRect, loadImage, canvasToBlob } from './func/image-func';

const fixedImageWidthPx = 300;
const margin = {
  top: 50,
  left: 20,
  right: 200,
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
@Component({
  selector: 'app-renketsu',
  templateUrl: './renketsu.component.html',
  styleUrls: ['./renketsu.component.scss']
})
export class RenketsuComponent implements OnInit {
  app_ver = (window as any)['app_ver'] ?? '';

  processing = false;
  progress = 0;
  images: string[] = [];
  imageSrc = '';
  accuracy = '12';

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
    progressFunc: (index: number, length: number) => Promise<void>): Promise<{
      index: number;
      // min: number;
      // max: number;
      // average: number;
  }> {
    const basePixelLines = getPixelsFromRect(scaledImageData1, availableRect1).select(x=> x.toArray());
    const comparePixelLines = getPixelsFromRect(scaledImageData2, availableRect2).take(compareLines).select(x=> x.toArray()).toArray();

    const results = [];
    const actualLineLen = basePixelLines.count() - compareLines
    for (let index = 0; index < basePixelLines.count() - compareLines; index++) {
      if (index % 10 == 0 && progressFunc != null) {
        await progressFunc(index, actualLineLen);
      }

      const basePixels = basePixelLines.skip(index).take(compareLines).toArray();
      const r = isEqualPixels(comparePixelLines, basePixels, deltaTolerance);
      if (r) {
        return { index };
      }
      // results.push({ ...r, index });
    }
    // const min = from(results).minBy(x => x.average);
    // return min;
    return { index: -1 };
  }

  async onJoin() {

    if (this.files.length != 2) {
      this.toast.warning('画像ファイルを2つ選択してください');
      return;
    }

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

      for (const { canvas, context, image, withoutMarginRect } of withoutMargins) {
        canvas.setAttribute('width', `${image.scaledImageData.width}px`);
        canvas.setAttribute('height', `${image.scaledImageData.height}px`);

        drawImage(context, image.scaledImageData, { x: 0, y: 0 }, { x: 0, y: 0, width: image.scaledImageData.width, height: image.scaledImageData.height });

        context.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        context.lineWidth = 4;
        context.strokeRect(withoutMarginRect.x, withoutMarginRect.y, withoutMarginRect.width, withoutMarginRect.height);

        this.images.push(canvas.toDataURL('image/png'));
      }

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

      for (const { canvas, context, image, availableRect } of availables) {

        context.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        context.lineWidth = 4;
        context.strokeRect(availableRect.x, availableRect.y, availableRect.width, availableRect.height);

        this.images.push(canvas.toDataURL('image/png'));
      }

      let ignoreTopPx = sameTopNum + margin.top;
      let ignoreBottomPx = sameLastNum + margin.bottom;





      let image1 = images[0];
      let image2 = images[1];
      const min = await this.compareImage(
        image1.scaledImageData, availables[0].availableRect,
        image2.scaledImageData, availables[1].availableRect,
        async (index, actualLineLen) => {
          this.progress = 10 + Math.ceil((index / actualLineLen) * 40);
          return new Promise(resolve => setTimeout(resolve, 10));
        });

      let hitIndex = min.index;
      this.progress = 50;
      await new Promise(resolve => setTimeout(resolve, 10));

      if (hitIndex < 0) {
        image1 = images[1];
        image2 = images[0];
        const min = await this.compareImage(
          image1.scaledImageData, availables[1].availableRect,
          image2.scaledImageData, availables[0].availableRect,
          async (index, actualLineLen) => {
            this.progress = 50 + Math.ceil((index / actualLineLen) * 40);
            return new Promise(resolve => setTimeout(resolve, 10));
          });

        hitIndex = min.index;
      }
      this.progress = 90;
      await new Promise(resolve => setTimeout(resolve, 10));

      const imageWid = image1.imageData.width;
      const imageHei = image1.imageData.height;

      const scale = availables[0].image.scale;
      ignoreTopPx = ignoreTopPx / scale;
      ignoreBottomPx = ignoreBottomPx / scale;
      hitIndex = hitIndex / scale;

      const contentHeight = imageHei - (ignoreTopPx + ignoreBottomPx);
      const outputHeight = ignoreTopPx + hitIndex + contentHeight + ignoreBottomPx;
      const canvas = document.createElement('canvas');
      canvas.setAttribute('width', `${imageWid}px`);
      canvas.setAttribute('height', `${outputHeight}px`);
      const context = canvas.getContext('2d')!;

      drawImage(context, image1.imageData, { x: 0, y: 0 }, { x: 0, y: 0, width: imageWid, height: ignoreTopPx });
      drawImage(context, image1.imageData, { x: 0, y: ignoreTopPx }, { x: 0, y: ignoreTopPx, width: imageWid, height: hitIndex });
      drawImage(context, image2.imageData, { x: 0, y: ignoreTopPx + hitIndex }, { x: 0, y: ignoreTopPx, width: imageWid, height: contentHeight });
      drawImage(context, image2.imageData, { x: 0, y: ignoreTopPx + hitIndex + contentHeight }, { x: 0, y: imageHei - ignoreBottomPx, width: imageWid, height: ignoreBottomPx });

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
