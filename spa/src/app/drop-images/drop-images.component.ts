import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { loadImageAsDataURL } from '../logic/image-func';

@Component({
  selector: 'app-drop-images',
  templateUrl: './drop-images.component.html',
  styleUrls: ['./drop-images.component.scss']
})
export class DropImagesComponent implements OnInit {
  @Input()
  files: File[] = [];


  @Output()
  readonly filesChange = new EventEmitter<File[]>();

  previews: { name: string, src: string }[] = [];

  ngOnInit(): void {
  }

  @ViewChild('fileInput')
  fileInput: any;

  file: File | null = null;

  onClickFileInputButton(): void {
    this.fileInput.nativeElement.click();
  }

  async onChangeFileInput(): Promise<void> {
    const files: { [key: string]: File } = this.fileInput.nativeElement.files;
    for (const f of Object.values(files)) {
      this.files.push(f);
      const url = await loadImageAsDataURL(f)
      this.previews.push({ name: f.name, src: url });
    }
    this.filesChange.emit(this.files);
  }

  onDeleteImage(i: number) {
    this.files.splice(i, 1);
    this.previews.splice(i, 1);
    this.filesChange.emit(this.files);
  }
}
