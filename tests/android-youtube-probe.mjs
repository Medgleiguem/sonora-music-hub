// Observational live probe: upstream failures are recorded as failures, never a passing download.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
if (!serial.startsWith('emulator-')) throw new Error('Emulator-only probe.');
const adb = (...args) => execFileSync(process.env.ADB || 'adb', ['-s', serial, ...args], { encoding: 'utf8' });
adb('shell', 'am', 'start', '-n', 'app.sonora.music/.MainActivity');
let socket;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const pid = adb('shell', 'pidof', 'app.sonora.music').trim();
    socket = `webview_devtools_remote_${pid}`;
    if (adb('shell', 'cat', '/proc/net/unix').includes(`@${socket}`)) break;
  } catch { }
  await new Promise(resolve => setTimeout(resolve, 250));
}
adb('forward', 'tcp:9223', `localabstract:${socket}`);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('https://localhost'));
const results = [];
try {
  for (const repeat of [false, true]) {
    const result = await page.evaluate(async () => {
      const started = performance.now();
      try {
        const data = await window.Capacitor.Plugins.SonoraMedia.search({ id: crypto.randomUUID(), query: 'جوليا بطرس مقاوم' });
        return { success: true, seconds: (performance.now() - started) / 1000, count: data.results.length, titles: data.results.slice(0, 2).map(track => track.title) };
      } catch (error) { return { success: false, seconds: (performance.now() - started) / 1000, error: error.message, code: error.code }; }
    });
    results.push({ operation: repeat ? 'search-warm' : 'search-cold', ...result });
    console.log(JSON.stringify(results.at(-1)));
  }
  for (const [externalId, title] of [['rjiYnWxoqM0', 'Julia Boutros - Moqawem'], ['jNQXAC9IVRw', 'Me at the zoo']]) {
    const playback = await page.evaluate(async ({ externalId, title }) => {
      const player = window.Capacitor.Plugins.SonoraPlayer;
      const started = performance.now();
      await player.setQueue({ items: [{ id: `youtube-${externalId}`, externalId, title, source: 'youtube' }], index: 0 });
      while (performance.now() - started < 65000) {
        const state = await player.state();
        if (state.error || state.playing && state.position > 1) { await player.pause(); return { success: !state.error, seconds: (performance.now() - started) / 1000, position: state.position, error: state.error }; }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      await player.pause(); return { success: false, error: 'Probe deadline reached.' };
    }, { externalId, title });
    results.push({ operation: 'stream', externalId, ...playback });
    console.log(JSON.stringify(results.at(-1)));
    const download = await page.evaluate(async externalId => {
      const media = window.Capacitor.Plugins.SonoraMedia;
      const id = crypto.randomUUID(), started = performance.now();
      try {
        const result = await media.download({ id, url: `https://www.youtube.com/watch?v=${externalId}`, format: 'm4a' });
        return { success: true, seconds: (performance.now() - started) / 1000, bytes: result.size, format: result.format };
      } catch (error) { return { success: false, seconds: (performance.now() - started) / 1000, error: error.message, code: error.code }; }
      finally { await media.release({ id }).catch(() => {}); }
    }, externalId);
    results.push({ operation: 'download', externalId, ...download });
    console.log(JSON.stringify(results.at(-1)));
  }
} finally {
  await mkdir('mobile-artifacts', { recursive: true });
  await writeFile('mobile-artifacts/android-youtube-probe.json', JSON.stringify(results, null, 2));
  await page.evaluate(() => window.Capacitor.Plugins.SonoraPlayer.pause()).catch(() => {});
  await browser.close();
}
