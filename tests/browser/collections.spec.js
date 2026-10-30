import { test, expect } from '@playwright/test';
import { chooseDownload, chooseOnline, closeDialog, downloadPreferences, goToTab, openDownloads, quietCatalog, searchFor, seedTracks, stored } from './ui.js';

const playlistUrl = 'https://www.youtube.com/playlist?list=PL123456789012';
const artist = { id: 'youtube-artist-UCabcdefghijklmnopqrstuv', kind: 'artist', title: 'Fairuz', artist: 'Fairuz', uploadsUrl: 'https://www.youtube.com/playlist?list=UUabcdefghijklmnopqrstuv' };
const song = (index, extra = {}) => ({ id: `youtube-${String(index).padStart(11, '0')}`, externalId: String(index).padStart(11, '0'), title: `Song ${index}`, artist: 'Fairuz', shareUrl: `https://www.youtube.com/watch?v=${String(index).padStart(11, '0')}`, source: 'youtube', playlistIndex: index, ...extra });
function wav(seconds = 1) {
  const bytes = Buffer.alloc(44 + 8000 * 2 * seconds);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
function download(title) {
  const bytes = wav();
  return [{ type: 'metadata', title, size: bytes.length, mime: 'audio/wav' }, { type: 'audio', data: bytes.toString('base64') }, { type: 'complete' }].map(event => JSON.stringify(event)).join('\n') + '\n';
}
async function startImport(page, url = playlistUrl) {
  await searchFor(page, url);
  await chooseDownload(page);
  await openDownloads(page);
}

test.beforeEach(async ({ page }) => { await quietCatalog(page); });

test('YouTube Mix links explain the finite snapshot before download', async ({ page }) => {
  await page.goto('/app');
  await searchFor(page, 'https://youtube.com/playlist?list=RDuSiHqxgE2d0&playnext=1');
  await expect(page.getByText('YouTube Mix', { exact: true })).toBeVisible();
  await expect(page.getByText(/snapshot of up to 100 songs/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Search music' }).fill(playlistUrl);
  await expect(page.getByText(/snapshot of up to 100/)).toHaveCount(0);
  await expect(page.getByText('YouTube playlist', { exact: true })).toBeVisible();
});

test('a Mix snapshot downloads into one persistent playlist and retry reuses its songs', async ({ page }) => {
  const canonical = 'https://www.youtube.com/playlist?list=RDuSiHqxgE2d0';
  let lookups = 0, downloads = 0;
  await downloadPreferences(page, { format: 'mp3' });
  await page.route('**/api/youtube/playlist?**', route => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('url')).toBe(canonical);
    expect(params.get('start')).toBe('1');
    lookups++;
    return route.fulfill({ json: { title: 'Mix snapshot', sourceUrl: canonical, entries: [song(1), song(2)], total: null, nextStart: null, limited: true } });
  });
  await page.route('**/api/youtube/download', route => {
    downloads++;
    return route.fulfill({ contentType: 'application/x-ndjson', body: download(`Song ${downloads}`) });
  });
  await page.goto('/app');
  await startImport(page, 'https://youtube.com/playlist?list=RDuSiHqxgE2d0&playnext=1&si=tracking');
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible();
  expect(downloads).toBe(2);
  const first = await stored(page, 'playlists');
  expect(first).toHaveLength(1);
  expect(first[0].sourceUrl).toBe(canonical);
  expect(first[0].trackIds).toHaveLength(2);
  await closeDialog(page);
  await page.reload();
  await startImport(page, 'https://www.youtube.com/watch?v=uSiHqxgE2d0&list=RDuSiHqxgE2d0');
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible();
  expect(downloads).toBe(2);
  expect(lookups).toBe(2);
  expect((await stored(page, 'playlists'))[0].trackIds).toEqual(first[0].trackIds);
});

test('a searched playlist opens, plays online, and saves without downloading', async ({ page }) => {
  const types = [];
  await page.route('**/api/youtube/search?**', route => {
    const type = new URL(route.request().url()).searchParams.get('type') || 'video'; types.push(type);
    return route.fulfill({ json: { results: type === 'playlist' ? [{ id: 'collection', kind: 'playlist', title: 'Evening classics', artist: 'Curator', shareUrl: playlistUrl, trackCount: 120 }] : [] } });
  });
  await page.route('**/api/youtube/playlist?**', route => {
    const start = Number(new URL(route.request().url()).searchParams.get('start') || 1);
    return route.fulfill({ json: { title: 'Evening classics', entries: start === 1 ? [song(1), song(2)] : [song(3)], total: 3, nextStart: start === 1 ? 3 : null } });
  });
  await page.route('**/api/youtube/download', () => { throw new Error('Saving online must not download audio'); });
  await page.goto('/app');
  await searchFor(page, 'classics');
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(page.getByText(/120 songs/)).toBeVisible();
  await page.getByRole('button', { name: 'Open playlist Evening classics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evening classics', exact: true })).toBeVisible();
  await expect(page.getByText('YouTube playlist · 2 songs', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Song 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more songs', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save to library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to library', exact: true })).toBeVisible();
  const [collection] = await stored(page, 'playlists');
  const tracks = await stored(page, 'tracks');
  expect(collection).toMatchObject({ name: 'Evening classics', sourceUrl: playlistUrl, trackIds: [song(1).id, song(2).id, song(3).id] });
  expect(tracks.map(track => [track.source, track.onlineImport])).toEqual([['youtube', true], ['youtube', true], ['youtube', true]]);
  expect(types).toContain('playlist');
  await page.getByRole('button', { name: 'Saved to library', exact: true }).click();
  await expect(page.getByText('3 songs', { exact: true })).toBeVisible();
  // The first download asks for consent once, then starts without further questions.
  await page.getByRole('button', { name: 'Download all', exact: true }).click();
  const consent = page.getByRole('dialog', { name: 'Before you download' });
  await expect(consent.getByText('3 songs from “Evening classics”', { exact: true })).toBeVisible();
  await expect(consent.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
});

test('a pasted playlist link can be saved to the library without downloading', async ({ page }) => {
  await page.route('**/api/youtube/playlist?**', route => route.fulfill({ json: { title: 'Pasted list', entries: [song(1), song(2)], total: 2, nextStart: null } }));
  await page.route('**/api/youtube/download', () => { throw new Error('Saving online must not download audio'); });
  await page.goto('/app');
  await searchFor(page, 'https://youtu.be/00000000001?list=PL123456789012&si=x');
  await chooseOnline(page);
  await expect(page.getByRole('heading', { name: 'Pasted list', exact: true })).toBeVisible();
  await expect(page.getByText('2 songs', { exact: true })).toBeVisible();
  const [collection] = await stored(page, 'playlists');
  expect(collection).toMatchObject({ name: 'Pasted list', sourceUrl: playlistUrl, trackIds: [song(1).id, song(2).id] });
});

test('playlist import continues past 100 and reuses saved audio', async ({ page }) => {
  const positions = [];
  await downloadPreferences(page, { format: 'mp3' });
  await page.route('**/api/youtube/playlist?**', route => {
    const start = Number(new URL(route.request().url()).searchParams.get('start') || 1); positions.push(start);
    return route.fulfill({ json: { title: 'Full collection', entries: start === 1 ? Array.from({ length: 100 }, (_, index) => song(index + 1)) : [song(101)], total: 101, nextStart: start === 1 ? 101 : null } });
  });
  await page.route('**/api/youtube/download', () => { throw new Error('Saved tracks must not be downloaded again'); });
  await page.goto('/app');
  await seedTracks(page, Array.from({ length: 101 }, (_, index) => ({ ...song(index + 1), source: 'youtube-download', fileName: `Song ${index + 1}.mp3`, addedAt: 1 })));
  await startImport(page);
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(positions).toEqual([1, 101]);
  const [collection] = await stored(page, 'playlists');
  expect(collection.trackIds).toHaveLength(101);
  expect(collection.trackIds[100]).toBe(song(101).id);
});

test('a temporary failure is retried automatically and alternate URL shapes reuse one playlist', async ({ page }) => {
  let failFirst = true;
  const downloaded = [];
  await downloadPreferences(page, { format: 'mp3' });
  await page.route('**/api/youtube/playlist?**', route => route.fulfill({ json: { title: 'Retry collection', entries: [song(1), song(2)], nextStart: null, total: 2 } }));
  await page.route('**/api/youtube/download', route => {
    const id = new URL(route.request().postDataJSON().url).searchParams.get('v'); downloaded.push(id);
    if (id === song(1).externalId && failFirst) { failFirst = false; return route.fulfill({ status: 502, json: { error: 'Fixture unavailable' } }); }
    return route.fulfill({ contentType: 'application/x-ndjson', body: download(`Song ${Number(id)}`) });
  });
  await page.goto('/app');
  await startImport(page, `https://youtu.be/00000000001?list=PL123456789012`);
  // The refused song is retried without the user pressing Resume.
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible({ timeout: 15_000 });
  // Another link shape for the same playlist continues the same Sonora playlist without downloading again.
  await page.getByRole('button', { name: 'New download', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search music' }).fill(playlistUrl);
  await chooseDownload(page);
  await openDownloads(page);
  await expect(page.getByText('Download complete', { exact: true })).toHaveCount(2);
  const collections = await stored(page, 'playlists');
  const tracks = await stored(page, 'tracks');
  expect(collections).toHaveLength(1);
  expect(collections[0].sourceUrl).toBe(playlistUrl);
  expect(collections[0].trackIds.map(id => tracks.find(track => track.id === id).title)).toEqual(['Song 1', 'Song 2']);
  expect(downloaded).toEqual(['00000000001', '00000000002', '00000000001']);
});

for (const entryPoint of ['Play all', 'Song row']) test(`artist ${entryPoint} replaces the queue and advances only through that artist`, async ({ page }) => {
  const audio = `data:audio/wav;base64,${wav(30).toString('base64')}`;
  const songs = [song(1, { source: 'local', audio }), song(2, { source: 'local', audio })];
  await page.addInitScript(() => {
    const Original = window.Audio;
    window.Audio = new Proxy(Original, { construct(target, args) { const element = Reflect.construct(target, args); window.__artistAudio = element; return element; } });
  });
  await page.route('**/api/youtube/search?**', route => route.fulfill({ json: { results: new URL(route.request().url()).searchParams.get('type') === 'artist' ? [artist] : [] } }));
  await page.route('**/api/youtube/playlist?**', route => route.fulfill({ json: { title: 'Uploads', entries: songs, nextStart: null } }));
  await page.goto('/app');
  await seedTracks(page, [{ ...songs[0], addedAt: 1 }, { ...song(3, { title: 'Unrelated song', source: 'local', audio }), addedAt: 1 }]);
  await goToTab(page, 'Library');
  await page.getByRole('button', { name: /^All songs/ }).click();
  await page.getByRole('button', { name: 'Play Song 1', exact: true }).click();
  await searchFor(page, 'fairuz');
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await page.getByRole('button', { name: 'Open artist Fairuz', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fairuz', exact: true })).toBeVisible();
  if (entryPoint === 'Song row') await page.getByRole('button', { name: /^(Play|Pause) Song 1$/ }).click();
  else await page.getByRole('button', { name: 'Play all', exact: true }).click();
  await expect(page.locator('.mini-text strong')).toHaveText('Song 1');
  await page.evaluate(() => window.__artistAudio.dispatchEvent(new Event('ended')));
  await expect(page.locator('.mini-text strong')).toHaveText('Song 2');
  await page.evaluate(() => window.__artistAudio.dispatchEvent(new Event('ended')));
  await expect(page.locator('.mini-text strong')).toHaveText('Song 1');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('switching search type ignores a late song response', async ({ page }) => {
  let finishSongs;
  await page.route('**/api/youtube/search?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('type') === 'video' && params.get('q')) {
      await new Promise(resolve => { finishSongs = resolve; });
      await route.fulfill({ json: { results: [song(1)] } }).catch(() => {});
    } else if (params.get('type') === 'playlist') await route.fulfill({ json: { results: [{ id: 'collection', kind: 'playlist', title: 'Only playlists', shareUrl: playlistUrl }] } });
    else await route.fulfill({ json: { results: [] } });
  });
  await page.goto('/app');
  await searchFor(page, 'classics');
  await expect.poll(() => Boolean(finishSongs)).toBe(true);
  await page.getByRole('button', { name: 'Playlists', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open playlist Only playlists' })).toBeVisible();
  finishSongs();
  await expect(page.getByRole('button', { name: 'Open playlist Only playlists' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Song 1', exact: true })).toHaveCount(0);
});

test('Android discovery bridge forwards artist type and playlist batch positions', async ({ page }) => {
  await page.addInitScript(({ artist, entry }) => {
    window.androidBridge = {};
    window.__mediaCalls = [];
    let sequence = 0;
    window.Capacitor = {
      PluginHeaders: ['SonoraMedia', 'SonoraPlayer'].map(name => ({ name, methods: [...['search', 'playlist', 'release', 'cancel', 'pendingDownload', 'state'].map(name => ({ name, rtype: 'promise' })), { name: 'addListener' }, { name: 'removeListener', rtype: 'promise' }] })),
      nativeCallback() { return String(++sequence); },
      async nativePromise(plugin, method, options = {}) {
        if (plugin === 'SonoraPlayer') return { items: [], currentId: null, playing: false };
        window.__mediaCalls.push({ method, options });
        if (method === 'search') return { results: options.type === 'artist' ? [artist] : [] };
        if (method === 'playlist') return { title: 'Uploads', entries: options.start === 1 ? [] : [entry], nextStart: options.start === 1 ? 101 : null };
        return { job: null };
      }
    };
  }, { artist, entry: song(101) });
  await page.goto('/app');
  await searchFor(page, 'fairuz');
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await page.getByRole('button', { name: 'Open artist Fairuz', exact: true }).click();
  await page.getByRole('button', { name: 'Load more songs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play Song 101', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => window.__mediaCalls);
  expect(calls.some(call => call.method === 'search' && call.options.type === 'artist')).toBe(true);
  expect(calls.filter(call => call.method === 'playlist').map(call => call.options.start)).toEqual([1, 101]);
});

test('Spotify link imports matched songs, then pasted songs complete the same playlist', async ({ page }) => {
  const spotifyId = index => `sp${String(index).padStart(20, '0')}`;
  const spotifySong = index => ({ id: `spotify-${spotifyId(index)}`, spotifyId: spotifyId(index), importKey: `spotify:${spotifyId(index)}`, source: 'spotify',
    title: `Song ${index}`, artist: 'Fairuz', album: '', duration: 1, cover: '', playlistIndex: index, spotifyUrl: `https://open.spotify.com/track/${spotifyId(index)}` });
  const searches = [];
  const downloads = [];
  await downloadPreferences(page);
  await page.route('**/api/spotify/lookup?**', route => {
    const url = new URL(route.request().url()).searchParams.get('url');
    if (url.includes('/playlist/')) return route.fulfill({ json: { title: 'Road trip', kind: 'playlist', sourceUrl: url, entries: [1, 2].map(spotifySong), total: 2, limited: true } });
    const index = Number(url.slice(-2));
    return route.fulfill({ json: { title: `Song ${index}`, kind: 'track', entries: [{ ...spotifySong(index), playlistIndex: 1 }], total: 1 } });
  });
  await page.route('**/api/youtube/search?**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('match') !== '1') return route.fallback();
    searches.push(params.get('q'));
    const index = Number(params.get('q').match(/Song (\d+)/)[1]);
    return route.fulfill({ json: { results: [song(index, { duration: 1 })] } });
  });
  await page.route('**/api/youtube/download', route => {
    downloads.push(new URL(route.request().postDataJSON().url).searchParams.get('v'));
    return route.fulfill({ body: download(`Video title ${downloads.length}`), contentType: 'application/x-ndjson' });
  });
  await page.goto('/app');
  await searchFor(page, 'https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe?si=share');
  await expect(page.getByText('Spotify playlist', { exact: true })).toBeVisible();
  await chooseDownload(page);
  await openDownloads(page);
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(searches).toEqual(['Fairuz - Song 1', 'Fairuz - Song 2']);
  let [collection] = await stored(page, 'playlists');
  expect(collection.name).toBe('Road trip');
  const tracks = await stored(page, 'tracks');
  expect(tracks.map(track => track.title).sort()).toEqual(['Song 1', 'Song 2']);

  await page.getByRole('button', { name: 'Add the remaining Spotify songs', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search music' }).fill([1, 2, 3].map(index => spotifySong(index).spotifyUrl).join(''));
  await expect(page.getByText('3 Spotify songs', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Playlist name')).toHaveValue('Road trip');
  await chooseDownload(page);
  await openDownloads(page);
  await expect(page.getByText('Download complete', { exact: true })).toHaveCount(2, { timeout: 20_000 });
  expect(searches).toEqual(['Fairuz - Song 1', 'Fairuz - Song 2', 'Fairuz - Song 3']);
  expect(downloads).toHaveLength(3);
  const playlists = await stored(page, 'playlists');
  expect(playlists).toHaveLength(1);
  [collection] = playlists;
  expect(collection.trackIds).toHaveLength(3);
});

test('Android reads Spotify songs through the native bridge before matching them', async ({ page }) => {
  await downloadPreferences(page);
  await page.addInitScript(() => {
    window.androidBridge = {};
    window.__mediaCalls = [];
    let sequence = 0;
    const trackList = [{ uri: 'spotify:track:sp00000000000000000001', title: 'Song 1', subtitle: 'Fairuz', duration: 1000, entityType: 'track' }];
    window.Capacitor = {
      PluginHeaders: ['SonoraMedia', 'SonoraPlayer'].map(name => ({ name, methods: [...['search', 'playlist', 'spotify', 'download', 'isForeground', 'release', 'cancel', 'pendingDownload', 'state'].map(name => ({ name, rtype: 'promise' })), { name: 'addListener' }, { name: 'removeListener', rtype: 'promise' }] })),
      nativeCallback() { return String(++sequence); },
      async nativePromise(plugin, method, options = {}) {
        if (plugin === 'SonoraPlayer') return { items: [], currentId: null, playing: false };
        window.__mediaCalls.push({ method, options });
        if (method === 'spotify') return { data: JSON.stringify({ props: { pageProps: { state: { data: { entity: { type: 'playlist', name: 'Native list', trackList } } } } } }) };
        if (method === 'search') return { results: options.query === 'Fairuz - Song 1' ? [{ id: 'youtube-00000000001', externalId: '00000000001', title: 'Fairuz - Song 1', artist: 'Fairuz', duration: 1, shareUrl: 'https://www.youtube.com/watch?v=00000000001', source: 'youtube' }] : [] };
        if (method === 'isForeground') return { foreground: true };
        if (method === 'download') throw new Error('This video is unavailable. Choose another video.');
        return { job: null };
      }
    };
  });
  await page.goto('/app');
  await searchFor(page, 'https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe');
  await chooseDownload(page);
  await expect.poll(() => page.evaluate(() => window.__mediaCalls.some(call => call.method === 'download')), { timeout: 20_000 }).toBe(true);
  await openDownloads(page);
  await expect(page.getByText('Download failed', { exact: true }).or(page.getByText('Finished with a few problems', { exact: true }))).toBeVisible({ timeout: 20_000 });
  const calls = await page.evaluate(() => window.__mediaCalls);
  expect(calls.find(call => call.method === 'spotify').options).toMatchObject({ kind: 'playlist', spotifyId: '37i9dQZF1DX4UtSsGT1Sbe' });
  expect(calls.find(call => call.method === 'search' && call.options.query === 'Fairuz - Song 1').options).toMatchObject({ type: 'video' });
  expect(calls.find(call => call.method === 'download').options.url).toBe('https://www.youtube.com/watch?v=00000000001');
});

test('downloading a saved online playlist keeps its songs, likes, and order in place', async ({ page }) => {
  await downloadPreferences(page);
  await page.route('**/api/youtube/playlist?**', route => route.fulfill({ json: { title: 'Upgrade list', entries: [song(1), song(2)], total: 2, nextStart: null } }));
  let downloads = 0;
  await page.route('**/api/youtube/download', route => { downloads++; return route.fulfill({ contentType: 'application/x-ndjson', body: download(`Video ${downloads}`) }); });
  await page.goto('/app');
  await searchFor(page, playlistUrl);
  await chooseOnline(page);
  await expect(page.getByText('2 songs', { exact: true })).toBeVisible();
  const before = (await stored(page, 'playlists'))[0];
  await page.getByRole('button', { name: 'Download all', exact: true }).click();
  await openDownloads(page);
  await expect(page.getByText('Download complete', { exact: true })).toBeVisible();
  expect(downloads).toBe(2);
  const [after] = await stored(page, 'playlists');
  const tracks = await stored(page, 'tracks');
  expect(after.trackIds).toEqual(before.trackIds);
  // Catalog titles are kept rather than replaced by video titles.
  expect(tracks.map(track => [track.title, track.source, track.downloadedFormat])).toEqual([['Song 1', 'youtube', 'm4a'], ['Song 2', 'youtube', 'm4a']]);
  await closeDialog(page);
  await expect(page.getByText('2 songs · 2 downloaded', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download all', exact: true })).toHaveCount(0);
});

test('liking online songs keeps them in Liked songs without downloading, ready to download later', async ({ page }) => {
  await page.route('**/api/youtube/search?**', route => route.fulfill({ json: { results: [song(1), song(2)] } }));
  await page.route('**/api/youtube/download', () => { throw new Error('Liking must not download audio'); });
  await page.goto('/app');
  await searchFor(page, 'fairuz');
  await page.getByRole('button', { name: 'Like Song 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Song 2 from Liked songs', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Like Song 1', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Song 1 from Liked songs', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Like Song 1', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await goToTab(page, 'Library');
  await page.getByRole('button', { name: /^Liked songs/ }).click();
  await expect(page.getByText('1 song', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Song 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Download all', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Before you download' }).getByText('1 song from “Liked songs”', { exact: true })).toBeVisible();
  const tracks = await stored(page, 'tracks');
  // Unliking an online song that is in no playlist removes it from the library entirely.
  expect(tracks.map(track => [track.title, track.favorite, track.source])).toEqual([['Song 2', true, 'youtube']]);
});

test('a Spotify playlist can be added for online listening without downloading anything', async ({ page }) => {
  const spotifyId = index => `sp${String(index).padStart(20, '0')}`;
  const entries = [1, 2, 3].map(index => ({ id: `spotify-${spotifyId(index)}`, spotifyId: spotifyId(index), importKey: `spotify:${spotifyId(index)}`, source: 'spotify',
    title: `Song ${index}`, artist: 'Fairuz', album: '', duration: 1, cover: '', playlistIndex: index, spotifyUrl: `https://open.spotify.com/track/${spotifyId(index)}` }));
  let busy = 0;
  let concurrent = 0, peak = 0;
  await page.route('**/api/spotify/lookup?**', route => route.fulfill({ json: { title: 'Road trip', kind: 'playlist', sourceUrl: new URL(route.request().url()).searchParams.get('url'), entries, total: 3, limited: false } }));
  await page.route('**/api/youtube/search?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('match') !== '1') return route.fallback();
    concurrent++; peak = Math.max(peak, concurrent);
    await new Promise(resolve => setTimeout(resolve, 50));
    concurrent--;
    // The first search of each song is refused, as Android does when its search slots are full.
    const index = Number(params.get('q').match(/Song (\d+)/)[1]);
    if (busy < 3 && index === busy + 1) { busy++; return route.fulfill({ status: 503, json: { error: 'Search is busy. Wait a moment and retry.' } }); }
    return route.fulfill({ json: { results: [song(index, { duration: 1 })] } });
  });
  await page.route('**/api/youtube/download', () => { throw new Error('Adding online must not download audio'); });
  await page.goto('/app');
  await searchFor(page, 'https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe');
  await expect(page.getByRole('button', { name: /^Add to library Plays online/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Download Saved on this phone/ })).toBeVisible();
  await chooseOnline(page);
  await openDownloads(page);
  await expect(page.getByText(/^Added to library/)).toBeVisible({ timeout: 20_000 });
  expect(peak).toBe(1);
  const [collection] = await stored(page, 'playlists');
  const tracks = await stored(page, 'tracks');
  expect(collection).toMatchObject({ name: 'Road trip', trackIds: [song(1).id, song(2).id, song(3).id] });
  expect(tracks.map(track => [track.title, track.source, track.onlineImport, Boolean(track.fileName)]).sort()).toEqual([1, 2, 3].map(index => [`Song ${index}`, 'youtube', true, false]));
});
