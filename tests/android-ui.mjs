// Run against Sonora's DEBUG APK in an emulator. Performs a real network download.
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const adbPath = process.env.ADB || 'adb';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
if (!serial.startsWith('emulator-')) throw new Error('This test changes emulator network state; physical devices are not allowed.');
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8' });
await mkdir('mobile-artifacts', { recursive: true });
adb('shell', 'pm', process.env.SONORA_DENY_NOTIFICATIONS ? 'revoke' : 'grant', 'app.sonora.music', 'android.permission.POST_NOTIFICATIONS');
adb('shell', 'am', 'start', '-n', 'app.sonora.music/.MainActivity');
let socket;
for (let attempt = 0; attempt < 30; attempt++) {
  let pid = '';
  try { pid = adb('shell', 'pidof', 'app.sonora.music').trim(); } catch { /* Activity launch is asynchronous. */ }
  const name = `webview_devtools_remote_${pid}`;
  socket = adb('shell', 'cat', '/proc/net/unix').includes(`@${name}`) ? name : null;
  if (socket) break;
  await new Promise(resolve => setTimeout(resolve, 300));
}
if (!socket) throw new Error('No debuggable Sonora WebView found.');
adb('forward', 'tcp:9223', `localabstract:${socket}`);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('https://localhost'));
if (!page) throw new Error('Sonora is not open.');
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  // Wait for hydration and the app's schema upgrade before opening IndexedDB.
  // Opening version 1 earlier can create a database with no object stores.
  await expect(page.getByText('Opening your library…', { exact: true })).toBeHidden();
  await expect(page.getByText(/Your device library could not be opened/)).toBeHidden();
  // Remove only this test's clip so repeat runs exercise the downloader, not duplicate skipping.
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('sonora-music', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    if (db.objectStoreNames.contains('tracks')) await new Promise((resolve, reject) => {
      const transaction = db.transaction('tracks', 'readwrite');
      const store = transaction.objectStore('tracks');
      const request = store.getAll();
      request.onsuccess = () => request.result.filter(track => track.source === 'youtube-download' && track.externalId === 'jNQXAC9IVRw').forEach(track => store.delete(track.id));
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByLabel('YouTube video or playlist URL').fill('https://youtu.be/jNQXAC9IVRw');
  await page.getByLabel('Audio format', { exact: true }).selectOption('mp3');
  await page.getByRole('checkbox', { name: /I have the right/ }).check();
  await page.getByRole('checkbox', { name: /Also keep a recovery copy/ }).check();
  await page.getByRole('button', { name: /^(Convert and save to device|Retry download)$/ }).click();
  // Switching apps must not cancel a user's download.
  await expect(page.getByRole('button', { name: 'Cancel download', exact: true })).toBeVisible();
  adb('shell', 'input', 'keyevent', '3');
  await new Promise(resolve => setTimeout(resolve, 3000));
  adb('shell', 'am', 'start', '-n', 'app.sonora.music/.MainActivity');
  await expect(page.locator('.download-progress-card')).toHaveClass(/complete|error|partial|cancelled/, { timeout: 280000 });
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'mobile-artifacts/android-download.png' });
  console.log('PASS: real Android download, conversion, and library storage');
  const exported = adb('shell', 'ls', '/sdcard/Download/Sonora');
  expect(exported).toContain('Me at the zoo.mp3');
  console.log('PASS: recovery MP3 exported to Downloads/Sonora');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Play Me at the zoo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  // Read the same IndexedDB blob used by the player and let the real media decoder validate it.
  const stored = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('sonora-music', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tracks = await new Promise((resolve, reject) => { const request = db.transaction('tracks').objectStore('tracks').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    return tracks.filter(track => track.source === 'youtube-download').map(track => ({ title: track.title, duration: track.duration, size: track.blob?.size || track.cachedBlob?.size }));
  });
  expect(stored.some(track => track.title === 'Me at the zoo' && track.duration > 18 && track.duration < 22)).toBe(true);
  console.log('PASS: saved MP3 decodes to the expected duration');
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Play Me at the zoo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.screenshot({ path: 'mobile-artifacts/android-offline.png' });
  console.log('PASS: offline reopen preserves library and playback');
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  // Avoid the IME consuming Back; blur before testing app navigation.
  await page.getByLabel('YouTube video or playlist URL').evaluate(element => element.blur());
  adb('shell', 'input', 'keyevent', '4');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  console.log('PASS: Android Back closes the dialog and keeps Sonora open; no JS errors');
} catch (error) {
  await page.screenshot({ path: 'mobile-artifacts/android-failure.png' }).catch(() => {});
  console.error((await page.locator('body').innerText()).slice(-2600));
  throw error;
} finally {
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  await browser.close();
}
