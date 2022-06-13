import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { RenketsuComponent } from './renketsu/renketsu.component';


const routes: Routes = [
  { path: '', component: RenketsuComponent },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      useHash: true,
      // enableTracing: true
      onSameUrlNavigation: 'reload',
      scrollPositionRestoration: 'top',
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
