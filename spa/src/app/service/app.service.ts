import { Injectable } from '@angular/core';
import { checkUpdate } from '../misc/app-updater';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  // @ts-ignore
  public readonly build_at = `${window['build_at']}`;
  public latest_build_at = '';
  public latest_app_version = '';
  public availableUpdate: boolean = false;

  constructor() { }

  async checkUpdate(): Promise<boolean> {
    try {
      const res = await checkUpdate({ build_at: this.build_at });
      this.latest_build_at = res?.build_at ?? '';
      this.latest_app_version = res?.app_version ?? '';
      return res.hasUpdate;
    } catch (error) {
      console.warn('fetch version.json failed.', error);
      return false;
    }
  }

}
