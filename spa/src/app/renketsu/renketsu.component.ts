import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { from } from 'linq';

@Component({
  selector: 'app-renketsu',
  templateUrl: './renketsu.component.html',
  styleUrls: ['./renketsu.component.scss']
})
export class RenketsuComponent implements OnInit {
  app_ver = (window as any)['app_ver'] ?? '';

  @ViewChild('myCanvas') myCanvas!: ElementRef<HTMLCanvasElement>;

  constructor() { }

  ngOnInit(): void {

  }

  files: File[] = [];

  onSelect(event: any) {
    console.log(event);
    this.files.push(...event.addedFiles);
  }

  onRemove(event: any) {
    console.log(event);
    this.files.splice(this.files.indexOf(event), 1);
  }

  async onJoin() {

    const topMarginPx = 0;
    const bottomMarginPx = 200;
    const leftMarginPx = 200;
    const rightMarginPx = 500;

    const loadLines: (f: File)=>Promise<{ imageData: ImageData, lines: Uint8ClampedArray[]}> = (f) =>
      new Promise((r: any) => {
        const image = new Image();
        image.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;

          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);

          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          console.log(`${this.constructor.name} ~ onJoin ~ imageData`, imageData);
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

      const image1 = await loadLines(this.files[0]);
      const image2 = await loadLines(this.files[1]);

      const bytesEquals = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
        return from(a).zip(b, (l, r) => ({l, r})).all(({l,r}) => l ==r);
      };

      const sameTopNum = from(image1.lines).zip(image2.lines, (l, r) => ({ l, r })).takeWhile((x) => bytesEquals(x.l, x.r)).count();
      const sameLastNum = from(image1.lines).zip(image2.lines, (l, r) => ({ l, r })).reverse().takeWhile((x) => bytesEquals(x.l, x.r)).count();
      const sameTopPx = sameTopNum + topMarginPx;
      const sameBottomPx = sameLastNum + bottomMarginPx;

      const top20lineA = from(image2.lines).skip(sameTopPx).take(100).selectMany(x => from(x)).toArray();
      const averaves = [];
      for( let i = 0; i < image1.lines.length - (sameBottomPx) - 100; i++) {
        const top20lineB = from(image1.lines).skip(sameTopPx).skip(i).take(100).selectMany(x => from(x)).toArray();

        const ave = from(top20lineA).zip(from(top20lineB), (l,r) => ({l,r}))
        .select(({l , r}) => {

          return Math.abs(l - r);
        }).average();

        averaves.push({i, ave});
        // if (ave < 3) {
        //   hitIndex = i;
        //   break;
        // }
      }
      // console.log(`${this.constructor.name} ~ onJoin ~ sameTop`, sameTopPx, sameBottomPx);
      const min = from(averaves).where(x => !Number.isNaN(x.ave)).minBy( x => x.ave);
      const hitIndex = min.i;

      const imageWid = image1.imageData.width;
      const imageHei = image1.imageData.height;

      const contentHeight = imageHei - (sameTopPx + sameBottomPx);
      const outputHeight = sameTopPx + hitIndex + contentHeight + sameBottomPx;
      const canvas = this.myCanvas.nativeElement;
      canvas.setAttribute('width', `${imageWid}px`);
      canvas.setAttribute('height', `${outputHeight}px`);
      const context = canvas.getContext('2d')!;

      context.clearRect(0, 0, 400, 400);
      context.fillStyle = '#ff0000';
      context.fillRect(0, 0, 100, 200);

      const drawImage = (context: CanvasRenderingContext2D, imageData: ImageData, location: {x: number, y: number}, srcRect: { left: number, top: number, width: number, height: number,  }) => {
        context.putImageData(imageData, location.x, location.y - srcRect.top, srcRect.left, srcRect.top, srcRect.width, srcRect.height);
      };

      let dst = {x: 0, y: 0};
      let src = {x: 0, y: 0, wid: imageWid, hei: sameTopPx};
      drawImage(context, image1.imageData, { x: 0, y: 0 }, { left: 0, top: 0, width: imageWid, height: sameTopPx });
      drawImage(context, image1.imageData, { x: 0, y: sameTopPx }, { left: 0, top: sameTopPx, width: imageWid, height: hitIndex });
      drawImage(context, image2.imageData, { x: 0, y: sameTopPx + hitIndex }, { left: 0, top: sameTopPx, width: imageWid, height: contentHeight });
      drawImage(context, image2.imageData, { x: 0, y: sameTopPx + hitIndex + contentHeight }, { left: 0, top: imageHei - sameBottomPx, width: imageWid, height: sameBottomPx });

      // canvas.toBlob(blob => {
      //   const file = new File([blob!], 'test.png');
      //   navigator.share({
      //     text: "共有テスト",
      //     url: "https://codepen.io/de_teiu_tkg/pen/dyWaaNP",
      //     files: [file],
      //   }).then(() => {
      //     console.log("共有成功.");
      //   }).catch((error) => {
      //     console.log(error);
      //   });

      // }, 'image/png')
  }

  get canShare(): boolean {
    return navigator?.share != null;
  }

  onShare() {
    const canvas = this.myCanvas.nativeElement;

    canvas.toBlob(blob => {
      const file = new File([blob!], 'test.png');
      const nav = navigator as any;
      nav.share({
        text: "共有テスト",
        url: "https://codepen.io/de_teiu_tkg/pen/dyWaaNP",
        files: [file],
      }).then(() => {
        console.log("共有成功.");
      }).catch((error: any) => {
        console.log(error);
      });

    }, 'image/png')
  }
}
