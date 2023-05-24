export async function checkUpdate(current: { build_at: string }): Promise<
  { hasUpdate: true, build_at: string, app_version: string } | { hasUpdate: false, build_at?: string, app_version?: string }
> {
  try {
    const res = await fetch(`version.json?date=${new Date().getTime()}`);
    const json = await res.json();
    console.log(json);
    const build_at = json.build_at;
    const app_version = json.app_version;
    const hasUpdate = build_at != current.build_at;

    return { hasUpdate, build_at, app_version };
  } catch (error) {
    console.warn('fetch version.json failed.', error);
    return { hasUpdate: false }
  }
}


// PWA を強制更新する(Serviceworker のキャッシュを破棄してリロード)
// https://www.codit.work/codes/pwqxmywbampxtls2k6jc/
export async function updateApp() {
  try {
    const registrations =
      await window.navigator.serviceWorker.getRegistrations();
    for (let registration of registrations) {
      registration.unregister();
    }

    const url = new URL(window.location.origin);
    url.pathname = window.location.pathname;
    url.searchParams.set('t', Date.now().toString());
    console.log(`updateApp ~ url:`, url);

    window.history.replaceState(null, '', url.toString());
    window.location.reload();
  } catch (error) {
    console.log(`[pwa-util]update ~ error`, error);
  }
}
