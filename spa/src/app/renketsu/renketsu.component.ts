import { Component, NgZone, OnInit } from '@angular/core';
import { saveAs } from 'file-saver';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {  canvasToBlob } from '../logic/image-func';

@Component({
  selector: 'app-renketsu',
  templateUrl: './renketsu.component.html',
  styleUrls: ['./renketsu.component.scss']
})
export class RenketsuComponent implements OnInit {
  app_ver = (window as any)['app_ver'] ?? '';

  options = {
    yPos: 55,
    height: 10
  }

  processing = false;
  progress = 0;
  images: { tag: string, image: string }[] = [];
  imageSrc = '';

  showDetails = false;

  files: File[] = [];
  private imageBlob: Blob | null = null;

  constructor(router: Router, activatedRoute: ActivatedRoute, private toast: ToastrService, private ngZone: NgZone) {
    router.routeReuseStrategy.shouldReuseRoute = () => false;

    const opStr = localStorage.getItem('options');
    if (opStr != null) {
      this.options = JSON.parse(opStr);
    }
  }

  ngOnInit(): void { }

  async onJoin() {
    this.files
    console.log(`${this.constructor.name} ~ onJoin ~ this.files`, this.files);
    this.progress = 0;
    this.processing = true;
    this.imageBlob = null;
    this.imageSrc = '';
    this.images = [];

    try {

      localStorage.setItem('options', JSON.stringify(this.options));

      const divLogs: any = document.getElementById('logs');

      let e = divLogs?.firstChild;
      while (e != null) {
        divLogs?.removeChild(e);
        e = divLogs?.firstChild;
      }

      // typescript のエラーを無視する
      // @ts-ignore
      const canvas = await window.join(this.files, this.options);
      this.imageSrc = canvas.toDataURL('image/png');
      this.imageBlob = await canvasToBlob(canvas, 'image/png');
      this.progress = 100;
      const end = new Date();
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
