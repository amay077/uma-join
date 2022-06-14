import { Component, OnInit, ViewChild } from '@angular/core';
import { from, IEnumerable } from 'linq';
import { saveAs } from 'file-saver';
import { ActivatedRoute, Router } from '@angular/router';

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise<Blob | null>(resolve => {
    canvas.toBlob(blob => {
      resolve(blob)
    }, type);
  });
}

const topMarginPx = 0;
const bottomMarginPx = 200;
const leftMarginPx = 50;
const rightMarginPx = 200;
const compareLines = 300;

async function loadImage(f: File): Promise<{ imageData: ImageData, lines: Uint8ClampedArray[]}> {
  return new Promise((r: any) => {
    const image = new Image();
    image.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      console.log(`onJoin ~ imageData`, imageData);
      const data = imageData.data;

      const lineBytes = canvas.width * 4;
      const rows = data.length / lineBytes;

      const leftMarginBytes = leftMarginPx * 4;
      const rightMarginBytes = rightMarginPx * 4;

      const lines = [];
      for (let row = topMarginPx; row < rows - (bottomMarginPx); row++) {
        const start = row * lineBytes + (leftMarginBytes);
        const end = start + lineBytes - (leftMarginBytes + rightMarginBytes);
        const line = data.subarray(start, end);
        lines.push(line);
      }
      r({ imageData, lines});
    };
    image.src = URL.createObjectURL(f);
  });
}

function bytesEquals(a: Uint8ClampedArray[]): boolean {
  return zip(a).all((arr) => eq(arr));
};

function eq(arr: any[]): boolean {
  return from(arr).pairwise((a, b) => a == b).all(x => x)
}

function zip<T>(arrays: T[]): IEnumerable<any[]> {

  const bufA = from(arrays[0]);
  let bufX = bufA.select(x => [x]);
  for (const bufY of arrays.slice(1)) {
    bufX = bufX.zip(bufY, (a: T[], b: T) => [...a, b]);
  }

  return bufX;
}

@Component({
  selector: 'app-renketsu',
  templateUrl: './renketsu.component.html',
  styleUrls: ['./renketsu.component.scss']
})
export class RenketsuComponent implements OnInit {
  app_ver = (window as any)['app_ver'] ?? '';

  processing = false;
  imageSrc = '';
  accuracy = '10';

  files: File[] = [];
  private imageBlob: Blob | null = null;

  constructor(router: Router, activatedRoute: ActivatedRoute) {
    router.routeReuseStrategy.shouldReuseRoute = () => false;

    if (activatedRoute.snapshot.queryParamMap.has('eruda')) {
      const eruda = require('eruda');
      eruda.init();
    }
  }

  ngOnInit(): void {
  }

  onSelect(event: any) {
    console.log(event);
    this.files.push(...event.addedFiles);
  }

  onRemove(event: any) {
    console.log(event);
    this.files.splice(this.files.indexOf(event), 1);
  }

  async onJoin() {

    this.processing = true;
    this.imageBlob = null;
    this.imageSrc = '';

    const images = await Promise.all(this.files.map(file => loadImage(file)));


    const zipedLines = zip(images.map(x => x.lines));
    const sameTopNum = zipedLines.takeWhile((arr) => bytesEquals(arr)).count();
    const sameLastNum = zipedLines.reverse().takeWhile((arr) => bytesEquals(arr)).count();

    const image1 = images[0];
    const image2 = images[1];


    const sameTopPx = sameTopNum + topMarginPx;
    const sameBottomPx = sameLastNum + bottomMarginPx;

    const compareLinesA = from(image2.lines).skip(sameTopPx).take(compareLines).selectMany(x => from(x));
    const averaves = [];
    const steps = Number(this.accuracy);
    for( let i = 0; i < image1.lines.length - (sameBottomPx) - compareLines; i+=steps) {
      const compareLinesB = from(image1.lines).skip(sameTopPx).skip(i).take(compareLines).selectMany(x => from(x));

      const ave = compareLinesA.buffer(4).zip(compareLinesB.buffer(4), (l,r) => [l,r])
        .select(([l,r]) => deltaE(l, r)).average();
      averaves.push({i, ave});

    }
    const min = from(averaves).where(x => !Number.isNaN(x.ave)).minBy(x => x.ave);
    const hitIndex = min.i;

    const imageWid = image1.imageData.width;
    const imageHei = image1.imageData.height;

    const contentHeight = imageHei - (sameTopPx + sameBottomPx);
    const outputHeight = sameTopPx + hitIndex + contentHeight + sameBottomPx;
    const canvas = document.createElement('canvas');
    // const canvas = this.myCanvas.nativeElement;
    canvas.setAttribute('width', `${imageWid}px`);
    canvas.setAttribute('height', `${outputHeight}px`);
    const context = canvas.getContext('2d')!;

    const drawImage = (context: CanvasRenderingContext2D, imageData: ImageData, location: {x: number, y: number}, srcRect: { left: number, top: number, width: number, height: number,  }) => {
      context.putImageData(imageData, location.x, location.y - srcRect.top, srcRect.left, srcRect.top, srcRect.width, srcRect.height);
    };

    drawImage(context, image1.imageData, { x: 0, y: 0 }, { left: 0, top: 0, width: imageWid, height: sameTopPx });
    drawImage(context, image1.imageData, { x: 0, y: sameTopPx }, { left: 0, top: sameTopPx, width: imageWid, height: hitIndex });
    drawImage(context, image2.imageData, { x: 0, y: sameTopPx + hitIndex }, { left: 0, top: sameTopPx, width: imageWid, height: contentHeight });
    drawImage(context, image2.imageData, { x: 0, y: sameTopPx + hitIndex + contentHeight }, { left: 0, top: imageHei - sameBottomPx, width: imageWid, height: sameBottomPx });

    this.imageSrc = canvas.toDataURL('image/png');
    this.imageBlob = await canvasToBlob(canvas, 'image/png');
    this.processing = false;
  }

  get canShare(): boolean {
    return navigator?.share != null;
  }

  async onShare() {
    // share();
    // return;

    const type = 'image/png';
    // const canvas = this.myCanvas.nativeElement;
    // const blob = await canvasToBlob(canvas, type);
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

// https://stackoverflow.com/a/52453462
function deltaE(rgbA: number[], rgbB: number[]): number {
  let labA = rgb2lab(rgbA);
  let labB = rgb2lab(rgbB);
  let deltaL = labA[0] - labB[0];
  let deltaA = labA[1] - labB[1];
  let deltaB = labA[2] - labB[2];
  let c1 = Math.sqrt(labA[1] * labA[1] + labA[2] * labA[2]);
  let c2 = Math.sqrt(labB[1] * labB[1] + labB[2] * labB[2]);
  let deltaC = c1 - c2;
  let deltaH = deltaA * deltaA + deltaB * deltaB - deltaC * deltaC;
  deltaH = deltaH < 0 ? 0 : Math.sqrt(deltaH);
  let sc = 1.0 + 0.045 * c1;
  let sh = 1.0 + 0.015 * c1;
  let deltaLKlsl = deltaL / (1.0);
  let deltaCkcsc = deltaC / (sc);
  let deltaHkhsh = deltaH / (sh);
  let i = deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh;
  return i < 0 ? 0 : Math.sqrt(i);
}

function rgb2lab(rgb: number[]): [number, number, number] {
  let r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, x, y, z;
  r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
  z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  x = (x > 0.008856) ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
  y = (y > 0.008856) ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
  z = (z > 0.008856) ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
  return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)]
}
