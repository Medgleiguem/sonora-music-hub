// Real native job + Activity destruction. Never run on a physical device.
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
if (!serial.startsWith('emulator-')) throw new Error('This test is emulator-only.');
const adb = (...args) => execFileSync(process.env.ADB || 'adb', ['-s', serial, ...args], { encoding: 'utf8' });
const previous = adb('shell', 'settings', 'get', 'global', 'always_finish_activities').trim();
let browser;
async function connect() {
  adb('shell', 'am', 'start', '-n', 'app.sonora.music/.MainActivity');
  let name;
  for (let attempt = 0; attempt < 60; attempt++) {
    let pid;
    try { pid = adb('shell', 'pidof', 'app.sonora.music').trim(); } catch { }
    name = pid ? `webview_devtools_remote_${pid}` : '';
    if (name && adb('shell', 'cat', '/proc/net/unix').includes(`@${name}`)) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  adb('forward', 'tcp:9223', `localabstract:${name}`);
  browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
  const page = browser.contexts()[0].pages().find(page => page.url().startsWith('https://localhost'));
  if (!page) throw new Error('Sonora WebView missing.');
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
  return page;
}
try {
  let page = await connect();
  const id = await page.evaluate(() => {
    const id = crypto.randomUUID();
    // Start the production native job directly so the old WebView cannot store/release it.
    window.Capacitor.Plugins.SonoraMedia.download({ id, url: 'https://youtu.be/jNQXAC9IVRw', format: 'm4a' }).catch(() => {});
    return id;
  });
  await expect.poll(() => adb('shell', 'dumpsys', 'activity', 'services', 'app.sonora.music')).toContain('DownloadService');
  adb('shell', 'settings', 'put', 'global', 'always_finish_activities', '1');
  adb('shell', 'input', 'keyevent', '3');
  await new Promise(resolve => setTimeout(resolve, 2000));
  await browser.close();
  page = await connect();
  const pending = await page.evaluate(() => window.Capacitor.Plugins.SonoraMedia.pendingDownload());
  expect(pending.job?.id).toBe(id);
  const result = await page.evaluate(id => window.Capacitor.Plugins.SonoraMedia.download({ id, url: 'https://youtu.be/jNQXAC9IVRw', format: 'm4a' }), id);
  expect(result.size).toBeGreaterThan(10000);
  await page.evaluate(id => window.Capacitor.Plugins.SonoraMedia.release({ id }), id);
  console.log('PASS: native download survives Activity destruction; recreated WebView reattaches to the same playable file');
} finally {
  adb('shell', 'settings', 'put', 'global', 'always_finish_activities', previous === 'null' ? '0' : previous);
  await browser?.close();
}
