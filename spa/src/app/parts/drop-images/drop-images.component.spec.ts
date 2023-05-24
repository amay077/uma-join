import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DropImagesComponent } from './drop-images.component';

describe('DropImagesComponent', () => {
  let component: DropImagesComponent;
  let fixture: ComponentFixture<DropImagesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DropImagesComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DropImagesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
