import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';    // add
import { BrowserModule } from '@angular/platform-browser';
// import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { NgxDropzoneModule } from 'ngx-dropzone';
import { ToastrModule } from 'ngx-toastr';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { RenketsuComponent } from './renketsu/renketsu.component';

@NgModule({
  declarations: [
    AppComponent,
    RenketsuComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    // NgbModule,
    NgxDropzoneModule,
    ToastrModule.forRoot({
      preventDuplicates: true,
      positionClass: 'toast-top-center',
    }),
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
