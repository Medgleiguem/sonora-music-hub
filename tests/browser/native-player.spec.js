import { test, expect } from '@playwright/test';
import { closeDialog, openAllSongs, quietCatalog, seedTracks } from './ui.js';

test('Android playback delegates to the native queue and reattaches to native state', async ({ page }) => {
  await page.addInitScript(() => {
    window.androidBridge = {};
    const listeners = new Map();
    let sequence = 0;
    window.__playerCalls = [];
    window.__nativeState = { items: [], currentId: null, index: 0, playing: false, position: 0, duration: 60 };
    window.__emitPlayerState = update => {
      Object.assign(window.__nativeState, update);
      for (const { plugin, event, callback } of listeners.values()) if (plugin === 'SonoraPlayer' && event === 'state') callback(window.__nativeState);
    };
    const playerMethods = ['state', 'setQueue', 'insert', 'play', 'pause', 'next', 'previous', 'seek', 'setOptions', 'select', 'add', 'clearUpcoming', 'remove', 'stageStart', 'stageChunk', 'stageFinish', 'stageAbort', 'removeMedia'];
    const mediaMethods = ['pendingDownload', 'isForeground', 'minimize', 'download', 'release', 'hold', 'unhold'];
    window.__mediaCalls = [];
    window.Capacitor = {
      PluginHeaders: [
        { name: 'SonoraPlayer', methods: [...playerMethods.map(name => ({ name, rtype: 'promise' })), { name: 'addListener' }, { name: 'removeListener', rtype: 'promise' }] },
        { name: 'SonoraMedia', methods: [...mediaMethods.map(name => ({ name, rtype: 'promise' })), { name: 'addListener' }, { name: 'removeListener', rtype: 'promise' }] }
      ],
      nativeCallback(plugin, method, options, callback) {
        const id = String(++sequence);
        listeners.set(id, { plugin, event: options.eventName, callback });
        return id;
      },
      async nativePromise(plugin, method, options = {}) {
        if (method === 'removeListener') { listeners.delete(options.callbackId); return; }
        if (plugin === 'SonoraMedia') {
          window.__mediaCalls.push({ method, options });
          if (method === 'download') throw new Error('This video is unavailable. Choose another video.');
          return method === 'pendingDownload' ? { job: null } : { foreground: true };
        }
        window.__playerCalls.push({ method, options });
        if (method === 'setQueue') window.__emitPlayerState({ items: options.items, currentId: options.items[options.index].id, index: options.index, playing: true });
        if (method === 'insert') { window.__nativeState.items.splice(options.index, 0, options.item); window.__emitPlayerState({}); }
        if (method === 'pause' || method === 'play') window.__emitPlayerState({ playing: method === 'play' });
        if (method === 'seek') window.__emitPlayerState({ position: options.position });
        if (method === 'next') { const next = (window.__nativeState.index + 1) % window.__nativeState.items.length; window.__emitPlayerState({ index: next, currentId: window.__nativeState.items[next].id, position: 0 }); }
        return window.__nativeState;
      }
    };
  });
  await quietCatalog(page);
  await page.goto('/app');
  await expect(page.getByText('Opening your library…', { exact: true })).toBeHidden();
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('sonora-music'); request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('tracks', 'readwrite');
    for (const [index, externalId] of ['jNQXAC9IVRw', 'M7lc1UVf-VE'].entries()) tx.objectStore('tracks').put({ id: `youtube-${externalId}`, externalId, title: `Native stream ${index}`, source: 'youtube', duration: 60, addedAt: 2 - index });
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
  });
  await page.reload();
  await openAllSongs(page);
  await page.getByRole('button', { name: 'Play Native stream 0', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__playerCalls.filter(call => call.method === 'setQueue').length)).toBe(1);
  await expect(page.locator('.youtube-dock')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__nativeState.items.length)).toBe(2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.mini-text strong')).toHaveText('Native stream 1');
  await page.evaluate(() => window.__emitPlayerState({ playing: true, position: 23 }));
  await page.getByRole('button', { name: 'Open now playing: Native stream 1', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Track position' })).toHaveValue('23');
  await page.getByRole('button', { name: 'Close now playing', exact: true }).click();
  expect(await page.evaluate(() => window.__playerCalls.some(call => call.method.startsWith('stage')))).toBe(false);
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('sonora-music'); request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key: 'androidDownloadRequest', value: { url: 'https://youtu.be/jNQXAC9IVRw', format: 'mp3' } });
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
  });
  await page.reload();
  // An interrupted download from an earlier version continues by itself; its failure can still be retried or removed.
  await expect.poll(() => page.evaluate(() => window.__mediaCalls.find(call => call.method === 'download')?.options.url)).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  await expect(page.getByText('Downloads need attention', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Open downloads: / }).click();
  await expect(page.getByText('Download failed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resume / })).toBeVisible();
  await page.getByRole('button', { name: /^Remove .* from downloads$/ }).click();
  await closeDialog(page);
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('sonora-music'); request.onsuccess = () => resolve(request.result); });
    const value = await new Promise(resolve => { const request = db.transaction('settings').objectStore('settings').get('androidDownloadRequest'); request.onsuccess = () => resolve(request.result?.value ?? null); });
    db.close(); return value;
  })).toBeNull();
  await page.reload();
  await expect(page.getByText('Downloads need attention', { exact: true })).toBeHidden();
});

test('Shuffle play on Android starts a random song and plays the whole list', async ({ page }) => {
  await page.addInitScript(() => {
    window.androidBridge = {};
    window.__queues = [];
    let sequence = 0;
    const state = { items: [], currentId: null, playing: false, position: 0, duration: 60 };
    window.Capacitor = {
      PluginHeaders: ['SonoraPlayer', 'SonoraMedia'].map(name => ({ name, methods: [...['state', 'setQueue', 'insert', 'setOptions', 'play', 'pause', 'pendingDownload', 'isForeground'].map(name => ({ name, rtype: 'promise' })), { name: 'addListener' }, { name: 'removeListener', rtype: 'promise' }] })),
      nativeCallback() { return String(++sequence); },
      async nativePromise(plugin, method, options = {}) {
        if (plugin === 'SonoraMedia') return method === 'pendingDownload' ? { job: null } : { foreground: true };
        if (method === 'setQueue') { window.__queues.push({ first: options.items[0].id, inserted: 0 }); Object.assign(state, { items: options.items, currentId: options.items[0].id, playing: true }); }
        if (method === 'insert') window.__queues.at(-1).inserted++;
        if (method === 'setOptions') window.__lastOptions = options;
        return state;
      }
    };
  });
  await quietCatalog(page);
  await page.goto('/app');
  await seedTracks(page, Array.from({ length: 20 }, (_, index) => ({ id: `youtube-${String(index).padStart(11, '0')}`, externalId: String(index).padStart(11, '0'), title: `Song ${index}`, source: 'youtube', favorite: true, addedAt: 100 - index })));
  await openAllSongs(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('button', { name: 'Shuffle play', exact: true }).click();
    await expect.poll(() => page.evaluate(count => window.__queues.length === count && window.__queues.at(-1).inserted === 19, attempt + 1)).toBe(true);
  }
  const queues = await page.evaluate(() => window.__queues);
  expect(queues.some(queue => queue.first !== 'youtube-00000000000')).toBe(true);
  expect(await page.evaluate(() => window.__lastOptions.shuffle)).toBe(true);
  await expect(page.locator('.mini-player')).toBeVisible();
});
