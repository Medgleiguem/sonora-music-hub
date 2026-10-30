// Live observational test. Imports real Mix audio; cancels after two saved songs.
// Run only against an isolated DEBUG emulator. This is not a 100-song network download.
import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith('emulator-')) throw new Error('Choose an isolated emulator with ANDROID_SERIAL.');
const adb = (...args) => execFileSync(process.env.ADB || 'adb', ['-s', serial, ...args], { encoding: 'utf8' });
const source = 'https://youtube.com/playlist?list=RDuSiHqxgE2d0&playnext=1&si=NdxhAtGsQM8MwdsF';
const canonical = 'https://www.youtube.com/playlist?list=RDuSiHqxgE2d0';
adb('shell', 'pm', 'grant', 'app.sonora.music', 'android.permission.POST_NOTIFICATIONS');
adb('shell', 'am', 'start', '-n', 'app.sonora.music/.MainActivity');
let socket;
for (let attempt = 0; attempt < 120; attempt++) {
  try {
    const pid = adb('shell', 'pidof', 'app.sonora.music').trim();
    const candidate = `webview_devtools_remote_${pid}`;
    if (adb('shell', 'cat', '/proc/net/unix').includes(candidate)) { socket = candidate; break; }
  } catch { /* Activity starting. */ }
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!socket) throw new Error('No Sonora debug WebView.');
adb('forward', 'tcp:9224', `localabstract:${socket}`);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9224', { noDefaults: true });
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('https://localhost'));
if (!page) throw new Error('No Sonora page.');
page.setDefaultTimeout(20000);
const evidence = [];
const record = value => { evidence.push(value); console.log(JSON.stringify(value)); };
const rows = () => page.evaluate(async canonical => {
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('sonora-music'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const read = store => new Promise(resolve => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); });
  const playlist = (await read('playlists')).find(item => item.sourceUrl === canonical);
  const tracks = (await read('tracks')).filter(item => playlist?.trackIds.includes(item.id)).map(item => ({ id: item.id, title: item.title, externalId: item.externalId, bytes: item.blob?.size || 0 }));
  db.close();
  return { playlist, tracks, progress: document.querySelector('.download-job-copy span')?.textContent || '', error: Boolean(document.querySelector('.download-job.error')) };
}, canonical);
try {
  await expect(page.getByText('Opening your library…', { exact: true })).toBeHidden();
  const metadata = await page.evaluate(async source => {
    const started = performance.now();
    const data = await window.Capacitor.Plugins.SonoraMedia.playlist({ id: crypto.randomUUID(), url: source, start: 1 });
    return { ms: Math.round(performance.now() - started), count: data.entries.length, title: data.title, first: data.entries[0]?.externalId, nextStart: data.nextStart, limited: data.limited, sourceUrl: data.sourceUrl };
  }, source);
  record({ operation: 'native-mix-metadata', ...metadata });
  expect(metadata.count).toBeGreaterThan(0);
  expect(metadata.count).toBeLessThanOrEqual(100);
  expect(metadata.first).toBe('uSiHqxgE2d0');
  expect(metadata.nextStart).toBeNull();
  expect(metadata.limited).toBe(true);
  expect(metadata.sourceUrl).toBe(canonical);
  await page.getByRole('button', { name: /^Download/ }).last().click();
  if (await page.getByRole('button', { name: 'New download', exact: true }).isVisible()) await page.getByRole('button', { name: 'New download', exact: true }).click();
  await page.getByLabel('YouTube or Spotify link').fill(source);
  await expect(page.getByText(/Mix detected.*up to 100 tracks/)).toBeVisible();
  await page.getByLabel('Audio format', { exact: true }).selectOption('mp3');
  await page.getByRole('checkbox', { name: /I have the right/ }).check();
  await page.getByRole('checkbox', { name: /Also keep/ }).uncheck();
  await page.getByRole('button', { name: 'Download playlist', exact: true }).click();
  const deadline = Date.now() + 600000;
  let saved, lastProgress;
  for (;;) {
    saved = await rows();
    if (saved.progress !== lastProgress) { record({ operation: 'download-progress', progress: saved.progress, saved: saved.tracks.length }); lastProgress = saved.progress; }
    if (saved.tracks.length >= 2) break;
    if (saved.error || Date.now() > deadline) throw new Error(`Mix import did not save two songs: ${saved.progress}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  // Stop partway: every song already saved stays in the playlist.
  await page.getByRole('button', { name: /^Stop / }).click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible({ timeout: 30000 });
  saved = await rows();
  expect(saved.tracks.every(item => item.bytes > 10000)).toBe(true);
  record({ operation: 'real-audio-saved', name: saved.playlist.name, tracks: saved.tracks });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  adb('shell', 'svc', 'wifi', 'disable'); adb('shell', 'svc', 'data', 'disable');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: `Play ${saved.tracks[0].title}`, exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const state = await window.Capacitor.Plugins.SonoraPlayer.state();
    if (state.error) throw new Error(state.error);
    return state.position;
  }), { timeout: 30000 }).toBeGreaterThan(0.5);
  await page.evaluate(() => window.Capacitor.Plugins.SonoraPlayer.pause());
  record({ operation: 'offline-reopen-native-playback', success: true });
  await page.screenshot({ path: '/tmp/sonora-mix-offline.png' });
} catch (error) {
  record({ operation: 'failure', error: error.message });
  console.error((await page.locator('body').innerText()).slice(-1800));
  throw error;
} finally {
  const cancel = page.getByRole('button', { name: /^Stop / });
  if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
  adb('shell', 'svc', 'wifi', 'enable'); adb('shell', 'svc', 'data', 'enable');
  await mkdir('mobile-artifacts', { recursive: true });
  await writeFile('mobile-artifacts/mix-live-verification.json', JSON.stringify(evidence, null, 2));
  await browser.close();
}
