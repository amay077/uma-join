import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RenketsuComponent } from './renketsu.component';

describe('RenketsuComponent', () => {
  let component: RenketsuComponent;
  let fixture: ComponentFixture<RenketsuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RenketsuComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RenketsuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
