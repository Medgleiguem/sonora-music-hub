// Emulator-only: real native decoding, screen-off queue advancement and Activity recovery.
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
if (!serial.startsWith('emulator-')) throw new Error('This test changes emulator settings and cannot run on a physical phone.');
const adb = (...args) => execFileSync(process.env.ADB || 'adb', ['-s', serial, ...args], { encoding: 'utf8' });
let browser, page;
async function attach() {
  await browser?.close().catch(() => {});
  adb('shell', 'am', 'start', '-n', 'app.sonora.music/.MainActivity');
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const pid = adb('shell', 'pidof', 'app.sonora.music').trim();
      const socket = `webview_devtools_remote_${pid}`;
      if (adb('shell', 'cat', '/proc/net/unix').includes(`@${socket}`)) {
        adb('forward', 'tcp:9223', `localabstract:${socket}`);
        browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
        page = browser.contexts()[0].pages().find(item => item.url().startsWith('https://localhost'));
        if (page) { page.setDefaultTimeout(15000); return; }
      }
    } catch { }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Sonora WebView did not become available.');
}
const state = () => page.evaluate(() => window.Capacitor.Plugins.SonoraPlayer.state());
const originalFinish = adb('shell', 'settings', 'get', 'global', 'always_finish_activities').trim();
try {
  await attach();
  await state();
  await expect(page.getByText('Opening your library…', { exact: true })).toBeHidden();
  await page.evaluate(async () => {
    const tone = seconds => {
      const rate = 8000, samples = rate * seconds, bytes = new ArrayBuffer(44 + samples * 2), view = new DataView(bytes);
      const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples * 2, true);
      for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i * Math.PI * 880 / rate) * 100), true);
      return new Blob([bytes], { type: 'audio/wav' });
    };
    const db = await new Promise(resolve => { const request = indexedDB.open('sonora-music'); request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('tracks', 'readwrite');
    for (const [index, duration] of [4, 90].entries()) tx.objectStore('tracks').put({ id: `local-background-probe-${index}`, title: `Background probe ${index ? 'B' : 'A'}`, source: 'local', duration, blob: tone(duration), addedAt: 2 - index });
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search music' }).fill('Background probe');
  await page.getByRole('button', { name: 'Play Background probe A', exact: true }).click();
  await expect.poll(async () => (await state()).playing).toBe(true);
  await expect.poll(async () => (await state()).items.length).toBe(2);
  adb('shell', 'settings', 'put', 'global', 'always_finish_activities', '1');
  adb('shell', 'input', 'keyevent', '3');
  adb('shell', 'input', 'keyevent', '223');
  await new Promise(resolve => setTimeout(resolve, 8000));
  adb('shell', 'input', 'keyevent', '224');
  await attach();
  await expect.poll(async () => (await state()).currentId).toBe('local-background-probe-1');
  expect((await state()).position).toBeGreaterThan(2);
  expect((await state()).playing).toBe(true);
  await expect(page.locator('.now-playing-copy strong')).toHaveText('Background probe B');
  console.log('PASS: screen-off playback and automatic next-track advancement survive destroyed Activity and WebView');
  adb('shell', 'cmd', 'media_session', 'dispatch', 'pause');
  await expect.poll(async () => (await state()).playing).toBe(false);
  await page.evaluate(() => window.Capacitor.Plugins.SonoraPlayer.seek({ position: 20 }));
  adb('shell', 'cmd', 'media_session', 'dispatch', 'play');
  await expect.poll(async () => (await state()).playing).toBe(true);
  expect((await state()).position).toBeGreaterThanOrEqual(20);
  console.log('PASS: Android system media controls pause/resume and native seeking update the restored UI');
  const sessions = adb('shell', 'dumpsys', 'media_session');
  expect(sessions).toContain('app.sonora.music');
  expect(sessions).toContain('Background probe B');
  console.log('PASS: active Android media session publishes the current track metadata');

  const streamFile = process.env.SONORA_STREAM_FIXTURE || '/tmp/sonora-live-stream.json';
  const track = JSON.parse(await readFile(streamFile, 'utf8'));
  await page.evaluate(track => window.Capacitor.Plugins.SonoraPlayer.setQueue({ items: [{ ...track, uri: track.audio }], index: 0 }), track);
  // playWhenReady is also true while buffering: wait for decoded audio before
  // measuring whether an already-playing stream continues in the background.
  await expect.poll(async () => {
    const snapshot = await state();
    if (snapshot.error) throw new Error(snapshot.error);
    return snapshot.playing && !snapshot.buffering && snapshot.position > 1;
  }, { timeout: 60000 }).toBe(true);
  const before = (await state()).position;
  adb('shell', 'input', 'keyevent', '3');
  adb('shell', 'input', 'keyevent', '223');
  await new Promise(resolve => setTimeout(resolve, 5000));
  adb('shell', 'input', 'keyevent', '224');
  await attach();
  expect((await state()).currentId).toBe(track.id);
  expect((await state()).position).toBeGreaterThan(before + 2);
  expect((await state()).playing).toBe(true);
  console.log('PASS: real HTTPS catalog audio streams and advances with the screen off without a saved audio Blob');
  await mkdir('mobile-artifacts', { recursive: true });
  await page.screenshot({ path: 'mobile-artifacts/android-background-player.png' });
} finally {
  adb('shell', 'settings', 'put', 'global', 'always_finish_activities', originalFinish === 'null' ? '0' : originalFinish);
  adb('shell', 'input', 'keyevent', '224');
  await page?.evaluate(() => window.Capacitor.Plugins.SonoraPlayer.pause()).catch(() => {});
  await browser?.close().catch(() => {});
}
