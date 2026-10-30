// Native downloads with a deterministic playlist lookup at the bridge boundary.
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
if (!serial.startsWith('emulator-')) throw new Error('This test is emulator-only.');
const adb = (...args) => execFileSync(process.env.ADB || 'adb', ['-s', serial, ...args], { encoding: 'utf8' });
adb('shell', 'pm', 'grant', 'app.sonora.music', 'android.permission.POST_NOTIFICATIONS');
adb('shell', 'am', 'start', '-n', 'app.sonora.music/.MainActivity');
let socket;
for (let attempt = 0; attempt < 60; attempt++) {
  let pid;
  try { pid = adb('shell', 'pidof', 'app.sonora.music').trim(); } catch { }
  socket = pid ? `webview_devtools_remote_${pid}` : '';
  if (socket && adb('shell', 'cat', '/proc/net/unix').includes(`@${socket}`)) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
adb('forward', 'tcp:9223', `localabstract:${socket}`);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('https://localhost'));
page.setDefaultTimeout(15000);
try {
  await page.evaluate(async () => {
    const media = window.Capacitor.Plugins.SonoraMedia;
    const { job } = await media.pendingDownload();
    if (job && /jNQXAC9IVRw|M7lc1UVf-VE/.test(job.url)) { await media.cancel({ id: job.id }); await media.release({ id: job.id }); }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Opening your library…', { exact: true })).toBeHidden();
  // Remove only synthetic test clips in these two formats to make repeats exercise the native bridge.
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('sonora-music'); r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction('tracks', 'readwrite'); const store = tx.objectStore('tracks');
    const r = store.getAll(); r.onsuccess = () => r.result.filter(track => ['jNQXAC9IVRw', 'M7lc1UVf-VE'].includes(track.externalId) && /\.(m4a|opus)$/.test(track.fileName || '')).forEach(track => store.delete(track.id));
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Opening your library…', { exact: true })).toBeHidden();
  await page.evaluate(() => {
    const original = window.Capacitor.nativePromise.bind(window.Capacitor);
    const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
    let transferTimeouts = 0;
    // Compress the old outer timeout only for later tracks. Waiting for foreground
    // must outlive this interval without failing or skipping the queued track.
    AbortSignal.timeout = ms => originalTimeout(ms === 285000 && ++transferTimeouts > 1 ? 50 : ms);
    window.__nativeDownloadCount = 0;
    window.Capacitor.nativePromise = (plugin, method, options) => {
      if (plugin === 'SonoraMedia' && method === 'playlist') return Promise.resolve({ title: 'Native playlist regression', entries: [
        { title: 'Me at the zoo', externalId: 'jNQXAC9IVRw', shareUrl: 'https://youtu.be/jNQXAC9IVRw' },
        { title: 'Player test', externalId: 'M7lc1UVf-VE', shareUrl: 'https://youtu.be/M7lc1UVf-VE' }
      ] });
      if (plugin === 'SonoraMedia' && method === 'download') {
        window.__nativeDownloadCount++;
        const result = original(plugin, method, options);
        // Several songs download at once; every finished transfer is held until the test releases them.
        if (window.__holdNativeTransfer) return result.then(value => new Promise(resolve => {
          (window.__heldTransfers ||= []).push(() => resolve(value));
          window.__resumeNativeTransfer = () => window.__heldTransfers.splice(0).forEach(release => release());
        }));
        return result;
      }
      return original(plugin, method, options);
    };
  });
  const start = async format => {
    await page.getByRole('button', { name: /^Download/ }).last().click();
    if (await page.getByRole('button', { name: 'New download', exact: true }).isVisible()) await page.getByRole('button', { name: 'New download', exact: true }).click();
    await page.getByLabel('YouTube or Spotify link').fill('https://www.youtube.com/playlist?list=PLsonoraRegression123');
    await page.getByLabel('Audio format', { exact: true }).selectOption(format);
    await page.getByRole('checkbox', { name: /I have the right/ }).check();
    await page.getByRole('checkbox', { name: /Also keep/ }).uncheck();
    await page.getByRole('button', { name: 'Download playlist', exact: true }).click();
  };
  await start('opus');
  await expect.poll(() => page.evaluate(() => window.__nativeDownloadCount)).toBeGreaterThanOrEqual(1);
  adb('shell', 'input', 'keyevent', '3');
  // Leaving Sonora no longer pauses a playlist: every song finishes while the app is in the background.
  await expect.poll(() => page.evaluate(() => window.__nativeDownloadCount), { timeout: 90000 }).toBe(2);
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible({ timeout: 120000 });
  adb('shell', 'am', 'start', '-n', 'app.sonora.music/.MainActivity');
  console.log('PASS: a playlist keeps downloading and saving while Sonora is in the background');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => { window.__nativeDownloadCount = 0; window.__holdNativeTransfer = true; });
  await start('m4a');
  await expect.poll(() => page.evaluate(() => Boolean(window.__resumeNativeTransfer)), { timeout: 90000 }).toBe(true);
  adb('shell', 'cmd', 'statusbar', 'expand-notifications');
  adb('shell', 'uiautomator', 'dump', '/sdcard/sonora-notification.xml');
  let xml = adb('shell', 'cat', '/sdcard/sonora-notification.xml');
  let bounds = xml.match(/text="Cancel all"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i);
  if (!bounds) {
    const notification = xml.slice(xml.indexOf('text="Saving your music"'));
    const expand = notification.match(/content-desc="Expand"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (expand) {
      adb('shell', 'input', 'tap', String((Number(expand[1]) + Number(expand[3])) / 2), String((Number(expand[2]) + Number(expand[4])) / 2));
      adb('shell', 'uiautomator', 'dump', '/sdcard/sonora-notification.xml');
      xml = adb('shell', 'cat', '/sdcard/sonora-notification.xml');
      bounds = xml.match(/text="Cancel all"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i);
    }
  }
  if (!bounds) throw new Error('Download notification Cancel all action was not visible.');
  adb('shell', 'input', 'tap', String((Number(bounds[1]) + Number(bounds[3])) / 2), String((Number(bounds[2]) + Number(bounds[4])) / 2));
  adb('shell', 'cmd', 'statusbar', 'collapse');
  await page.evaluate(() => window.__resumeNativeTransfer());
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  // Both songs may have started together; nothing starts after the cancellation.
  expect(await page.evaluate(() => window.__nativeDownloadCount)).toBeLessThanOrEqual(2);
  console.log('PASS: the actual Android notification Cancel all action stops the playlist');
} finally {
  adb('shell', 'cmd', 'statusbar', 'collapse');
  await page.evaluate(async () => {
    const media = window.Capacitor.Plugins.SonoraMedia;
    const { jobs = [] } = await media.pendingDownload();
    for (const job of jobs) if (/jNQXAC9IVRw|M7lc1UVf-VE/.test(job.url)) { await media.cancel({ id: job.id }); await media.release({ id: job.id }); }
  }).catch(() => {});
  await browser.close();
}
