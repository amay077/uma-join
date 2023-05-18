import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { loadImageAsDataURL } from '../logic/image-func';

@Component({
  selector: 'app-drop-images',
  templateUrl: './drop-images.component.html',
  styleUrls: ['./drop-images.component.scss']
})
export class DropImagesComponent implements OnInit {

  @Output() readonly filesChange = new EventEmitter<File[]>();
  @Output() readonly clear = new EventEmitter<void>();

  previews: { file: File, src: string }[] = [];

  options = {
    handle: '.handle',
    onUpdate: (event: any) => {
      this.filesChange.emit(this.previews.map(p => p.file));
    }
  };

  ngOnInit(): void {
  }

  @ViewChild('fileInput')
  fileInput: any;


  onClickFileInputButton(): void {
    this.fileInput.nativeElement.click();
  }

  async onChangeFileInput(): Promise<void> {
    const files: { [key: string]: File } = this.fileInput.nativeElement.files;
    for (const file of Object.values(files)) {
      const url = await loadImageAsDataURL(file)
      this.previews.push({ file, src: url });
    }
    this.filesChange.emit(this.previews.map(p => p.file));
    this.fileInput.nativeElement.value = '';
  }

  onDeleteImage(i: number) {
    this.previews.splice(i, 1);
    this.filesChange.emit(this.previews.map(p => p.file));
  }

  onClearImages() {
    this.previews = [];
    this.filesChange.emit([]);
    this.clear.emit();
  }

}
