// Observational emulator benchmark. Upstream refusals remain recorded failures.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
if (!serial.startsWith('emulator-')) throw new Error('This benchmark only controls an emulator.');
const adb = (...args) => execFileSync(process.env.ADB || 'adb', ['-s', serial, ...args], { encoding: 'utf8' });
adb('shell', 'am', 'start', '-n', 'app.sonora.music/.MainActivity');
let socket;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const pid = adb('shell', 'pidof', 'app.sonora.music').trim();
    const candidate = `webview_devtools_remote_${pid}`;
    if (adb('shell', 'cat', '/proc/net/unix').includes(candidate)) { socket = candidate; break; }
  } catch { /* Activity starting. */ }
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!socket) throw new Error('No Sonora WebView available.');
adb('forward', 'tcp:9223', `localabstract:${socket}`);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { noDefaults: true });
const page = browser.contexts()[0].pages().find(page => page.url().startsWith('https://localhost'));
if (!page) throw new Error('Sonora is not open.');
const results = [];
const record = value => { results.push(value); console.log(JSON.stringify(value)); };
try {
  const candidates = [];
  for (const query of ['فيروز Fairuz', 'جوليا بطرس مقاوم', 'Fairuz morning']) {
    for (const warm of [false, true]) {
      const result = await page.evaluate(async ({ query }) => {
        const started = performance.now();
        try {
          const data = await window.Capacitor.Plugins.SonoraMedia.search({ id: crypto.randomUUID(), query, type: 'video' });
          return { ms: Math.round(performance.now() - started), success: true, count: data.results.length, backend: data.lookupBackend, first: data.results[0]?.externalId };
        } catch (error) { return { ms: Math.round(performance.now() - started), success: false, error: error.message }; }
      }, { query });
      record({ operation: warm ? 'search-warm' : 'search-cold', query, ...result });
      if (!warm && result.first) candidates.push(result.first);
    }
  }
  if (process.env.SONORA_SEARCH_ONLY !== '1') for (const externalId of candidates.slice(0, 2)) {
    for (const warm of [false, true]) {
      const result = await page.evaluate(async externalId => {
        const player = window.Capacitor.Plugins.SonoraPlayer;
        await player.setOptions({ muted: true });
        const started = performance.now();
        await player.setQueue({ items: [{ id: `youtube-${externalId}`, externalId, title: 'Performance probe', source: 'youtube' }], index: 0 });
        for (;;) {
          const state = await player.state();
          if (state.error || !state.buffering && state.position > 0.25) {
            await player.pause();
            return { ms: Math.round(performance.now() - started), success: !state.error, error: state.error || undefined };
          }
          if (performance.now() - started > 50000) { await player.pause(); return { ms: 50000, success: false, error: 'Probe deadline reached.' }; }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }, externalId);
      record({ operation: warm ? 'stream-reopen' : 'stream-cold', externalId, ...result });
      if (!result.success) break;
    }
  }
} finally {
  await mkdir('mobile-artifacts', { recursive: true });
  await writeFile(`mobile-artifacts/performance-${process.env.SONORA_PERF_LABEL || 'baseline'}.json`, JSON.stringify(results, null, 2));
  await page.evaluate(async () => { const player = window.Capacitor.Plugins.SonoraPlayer; await player.pause(); await player.setOptions({ muted: false }); }).catch(() => {});
  await browser.close();
}
