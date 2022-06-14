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
  accuracy = '4';

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

    const top20lineA = from(image2.lines).skip(sameTopPx).take(200).selectMany(x => from(x)).toArray();
    const averaves = [];
    const steps = Number(this.accuracy);
    for( let i = 0; i < image1.lines.length - (sameBottomPx) - 300; i+=steps) {
      const top20lineB = from(image1.lines).skip(sameTopPx).skip(i).take(100).selectMany(x => from(x)).toArray();

      const ave = from(top20lineA).zip(from(top20lineB), (l,r) => [l,r])
      .select(([l,r]) => {

        return Math.abs(l - r);
      }).average();

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
        text: "共有テスト",
        url: "https://codepen.io/de_teiu_tkg/pen/dyWaaNP",
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
    text: "共有テスト",
    url: "https://codepen.io/de_teiu_tkg/pen/dyWaaNP",
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
