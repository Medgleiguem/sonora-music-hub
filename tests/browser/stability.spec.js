import { test, expect } from '@playwright/test';
import { chooseDownload, closeDialog, downloadPreferences, goToTab, openAllSongs, openDownloads, quietCatalog, searchFor } from './ui.js';

// A real, generated 30-second PCM WAV keeps playback tests independent of media services.
function wavFile(name = 'Regression tone.wav') {
  const sampleRate = 8000;
  const samples = sampleRate * 30;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    buffer.writeInt16LE(Math.round(Math.sin(index * 2 * Math.PI * 440 / sampleRate) * 100), 44 + index * 2);
  }
  return { name, mimeType: 'audio/wav', buffer };
}

function downloadEvents(title, { complete = true } = {}) {
  const { buffer } = wavFile();
  const events = [
    { type: 'stage', stage: 'preparing' },
    { type: 'metadata', title, size: buffer.length, mime: 'audio/wav' },
  ];
  for (let offset = 0; offset < buffer.length; offset += 32 * 1024) {
    events.push({ type: 'audio', data: buffer.subarray(offset, offset + 32 * 1024).toString('base64') });
  }
  if (complete) events.push({ type: 'complete' });
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}

async function startDownload(page, url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw') {
  await searchFor(page, url);
  await chooseDownload(page);
}

async function importWav(page, file = wavFile()) {
  await page.getByRole('button', { name: 'Add music', exact: true }).first().click();
  await page.getByRole('dialog').locator('input[type=file]').first().setInputFiles(file);
}

test.beforeEach(async ({ page }) => {
  // Vercel provides this optional script; local production tests have no analytics endpoint.
  await page.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await quietCatalog(page);
  await downloadPreferences(page);
  // Observe real Audio objects without replacing their browser behavior.
  await page.addInitScript(() => {
    const OriginalAudio = window.Audio;
    window.__testAudioElements = [];
    window.Audio = new Proxy(OriginalAudio, {
      construct(target, args) {
        const element = Reflect.construct(target, args);
        window.__testAudioElements.push(element);
        return element;
      },
    });
  });
  await page.goto('/app');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByText('Opening your library…', { exact: true })).toBeHidden();
});

test('searching does not allocate more audio players', async ({ page }) => {
  await goToTab(page, 'Search');
  const countBefore = await page.evaluate(() => window.__testAudioElements.length);
  await page.getByRole('textbox', { name: 'Search music' }).pressSequentially('regression', { delay: 30 });
  await expect(page.getByText('No songs found', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__testAudioElements.length)).toBe(countBefore);
});

test('liking a playing local track preserves playback position and source', async ({ page }) => {
  await importWav(page);
  await expect(page.getByRole('dialog')).toBeHidden();
  await openAllSongs(page);
  await page.getByRole('button', { name: 'Play Regression tone', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open now playing: Regression tone', exact: true }).click();
  const position = page.getByRole('slider', { name: 'Track position', exact: true });
  await position.fill('10');
  await expect.poll(() => page.evaluate(() => window.__testAudioElements.find((audio) => audio.src)?.currentTime)).toBeGreaterThanOrEqual(9.9);
  const sourceBefore = await page.evaluate(() => window.__testAudioElements.find((audio) => audio.src)?.src);
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove from favorites', exact: true })).toBeVisible();
  const currentAudio = await page.evaluate(() => {
    const audio = window.__testAudioElements.find((element) => element.src);
    return { src: audio.src, position: audio.currentTime, paused: audio.paused };
  });
  expect(currentAudio.src).toBe(sourceBefore);
  expect(currentAudio.position).toBeGreaterThanOrEqual(9.9);
  expect(currentAudio.paused).toBe(false);
});

test('closing the downloads panel keeps a download running until it is stopped', async ({ page }) => {
  let releaseDownload;
  const downloadGate = new Promise((resolve) => { releaseDownload = resolve; });
  await page.route('**/api/youtube/download', async (route) => {
    await downloadGate;
    await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: downloadEvents('Hidden download') }).catch(() => {});
  });
  const failedDownloads = [];
  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/youtube/download')) failedDownloads.push(request.failure()?.errorText);
  });
  try {
    const requestStarted = page.waitForRequest('**/api/youtube/download');
    await startDownload(page);
    await requestStarted;
    await openDownloads(page);
    await closeDialog(page);
    // The rest of the app stays usable while the download continues.
    await goToTab(page, 'Library');
    await page.getByRole('button', { name: /^Open downloads: / }).click();
    expect(failedDownloads).toEqual([]);
    await page.getByRole('button', { name: /^Stop / }).click();
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Resume / })).toBeVisible();
  } finally {
    releaseDownload();
  }
});

test('two downloads run at the same time and each can be stopped on its own', async ({ page }) => {
  const gates = new Map();
  await page.route('**/api/youtube/download', async (route) => {
    const id = new URL(route.request().postDataJSON().url).searchParams.get('v');
    await new Promise((resolve) => gates.set(id, resolve));
    await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: downloadEvents(`Song ${id}`) }).catch(() => {});
  });
  await startDownload(page, 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  await page.getByRole('textbox', { name: 'Search music' }).fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
  await chooseDownload(page);
  await expect.poll(() => gates.size).toBe(2);
  await openDownloads(page);
  await expect(page.getByRole('button', { name: /^Stop / })).toHaveCount(2);
  await page.getByRole('button', { name: /^Stop / }).first().click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  gates.get('jNQXAC9IVRw')();
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible();
  gates.get('M7lc1UVf-VE')();
  const titles = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('sonora-music'); r.onsuccess = () => resolve(r.result); });
    const rows = await new Promise(resolve => { const r = db.transaction('tracks').objectStore('tracks').getAll(); r.onsuccess = () => resolve(r.result); });
    db.close(); return rows.map(row => row.title);
  });
  expect(titles).toEqual(['Song jNQXAC9IVRw']);
});

test('an invalid audio file cannot leave the import dialog stuck', async ({ page }) => {
  await importWav(page, {
    name: 'Broken metadata.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3\u0004\u0000\u0000\u007f\u007f\u007f\u007f'),
  });
  await expect(page.getByText('Reading your music…', { exact: true })).toBeHidden({ timeout: 15_000 });
  if (await page.getByRole('dialog').isVisible()) {
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  }
  await expect(page.getByRole('dialog')).toBeHidden();
  await goToTab(page, 'Library');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
});


test('a complete streamed download is playable and persists in the library', async ({ page }) => {
  await page.route('**/api/youtube/download', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', format: 'm4a' });
    await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: downloadEvents('Downloaded regression') });
  });
  await startDownload(page);
  await openDownloads(page);
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible();
  await closeDialog(page);
  await page.reload();
  await openAllSongs(page);
  await page.getByRole('button', { name: 'Play Downloaded regression', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__testAudioElements.find((audio) => audio.src)?.currentTime)).toBeGreaterThan(0);
});

test('an interrupted download is retried and never stores an incomplete track', async ({ page }) => {
  test.setTimeout(60_000);
  let attempts = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/youtube/download')) attempts++; });
  await page.route('**/api/youtube/download', (route) => route.fulfill({
    status: 200, contentType: 'application/x-ndjson', body: downloadEvents('Incomplete regression', { complete: false }),
  }));
  await startDownload(page);
  await openDownloads(page);
  await expect(page.getByRole('button', { name: /^Stop / })).toBeHidden({ timeout: 45_000 });
  expect(attempts).toBeGreaterThan(1);
  await expect(page.getByRole('dialog').locator('.download-job')).toHaveClass(/error|partial/);
  await expect(page.getByText('Download complete', { exact: true })).toBeHidden();
  await closeDialog(page);
  await page.reload();
  await goToTab(page, 'Library');
  await expect(page.getByText('Your library is empty', { exact: true })).toBeVisible();
});

test('cancelling a playlist preserves tracks already saved inside its playlist', async ({ page }) => {
  const entries = [
    { title: 'Playlist first', externalId: 'jNQXAC9IVRw', shareUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
    { title: 'Playlist second', externalId: 'M7lc1UVf-VE', shareUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' },
  ];
  await page.route('**/api/youtube/playlist?**', (route) => route.fulfill({ json: { title: 'Saved before cancellation', entries } }));
  let releaseSecond;
  const secondGate = new Promise((resolve) => { releaseSecond = resolve; });
  await page.route('**/api/youtube/download', async (route) => {
    const first = route.request().postDataJSON().url.includes(entries[0].externalId);
    if (!first) await secondGate;
    await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: downloadEvents(first ? 'Playlist first' : 'Playlist second') }).catch(() => {});
  });
  try {
    const secondStarted = page.waitForRequest((request) => request.url().endsWith('/api/youtube/download') && request.postDataJSON()?.url.includes(entries[1].externalId));
    await startDownload(page, 'https://www.youtube.com/playlist?list=PLregression123');
    await secondStarted;
    await openDownloads(page);
    await page.getByRole('button', { name: /^Stop / }).click();
    await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
    await closeDialog(page);
    await page.reload();
    await goToTab(page, 'Library');
    await page.getByRole('button', { name: 'Open playlist Saved before cancellation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play Playlist first', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play Playlist second', exact: true })).toBeHidden();
  } finally {
    releaseSecond();
  }
});

test('a cancellation from the native downloader stops the whole playlist', async ({ page }) => {
  const entries = ['jNQXAC9IVRw', 'M7lc1UVf-VE', 'dQw4w9WgXcQ', '9bZkp7q19f0'].map((id, index) => ({ title: `Song ${index + 1}`, externalId: id, shareUrl: `https://youtu.be/${id}` }));
  await page.route('**/api/youtube/playlist?**', route => route.fulfill({ json: { title: 'Cancellation', entries } }));
  await page.evaluate(() => {
    const fetch = window.fetch;
    window.__downloadAttempts = 0;
    window.fetch = (...args) => {
      if (String(args[0]).endsWith('/api/youtube/download')) {
        window.__downloadAttempts++;
        return Promise.reject(new DOMException('Cancelled from the download notification.', 'AbortError'));
      }
      return fetch(...args);
    };
  });
  await startDownload(page, 'https://www.youtube.com/playlist?list=PLregression123');
  await openDownloads(page);
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  // Only the songs already running together were attempted; nothing after the cancellation started.
  expect(await page.evaluate(() => window.__downloadAttempts)).toBeLessThanOrEqual(2);
});

for (const width of [320, 768, 1440]) {
  test(`home and a bottom sheet fit a ${width}px viewport without browser errors`, async ({ page }, testInfo) => {
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Search music', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true, animations: 'disabled' });
    await goToTab(page, 'Library');
    await page.getByRole('button', { name: 'Create or add', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`sheet-${width}.png`), fullPage: true, animations: 'disabled' });
    expect(browserErrors).toEqual([]);
  });
}

test('storage opening failures show retry and recover without a blank screen', async ({ page }) => {
  await page.addInitScript(() => {
    window.__blockStorage = true;
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      if (window.__blockStorage) throw new DOMException('Storage is disabled', 'SecurityError');
      return original.apply(this, args);
    };
  });
  await page.reload();
  await expect(page.getByText(/Your device library could not be opened/)).toBeVisible();
  await page.evaluate(() => { window.__blockStorage = false; });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText(/Your device library could not be opened/)).toBeHidden();
  await goToTab(page, 'Library');
  await expect(page.getByText('Your library is empty', { exact: true })).toBeVisible();
});

test('a full device does not leave imports stuck', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'tracks') throw new DOMException('Device storage is full', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.reload();
  await importWav(page);
  await expect(page.getByRole('dialog')).toBeHidden();
  await goToTab(page, 'Library');
  await expect(page.getByText('Your library is empty', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create or add', exact: true }).click();
  await page.getByRole('button', { name: /^Add music from this device/ }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Choose audio files/ })).toBeEnabled();
});

if (process.env.PLAYWRIGHT_PRODUCTION) {
  test('the first offline reopen loads the app and plays imported audio', async ({ page, context }) => {
    await importWav(page);
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true);
    await page.reload();
    // Chrome's network emulation can leave navigator.onLine true; prove connectivity is unavailable.
    expect(await page.evaluate(() => fetch('/api/offline-probe').then(() => true).catch(() => false))).toBe(false);
    await openAllSongs(page);
    await page.getByRole('button', { name: 'Play Regression tone', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__testAudioElements.find((audio) => audio.src)?.currentTime)).toBeGreaterThan(0);
  });
}
