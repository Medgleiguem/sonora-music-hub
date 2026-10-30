import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET as search } from '../app/api/youtube/search/route.js';
import { GET as playlist } from '../app/api/youtube/playlist/route.js';

const request = path => new Request(`http://localhost/api/youtube/${path}`);
function env(t, name, value) {
  const previous = process.env[name];
  if (value == null) delete process.env[name]; else process.env[name] = value;
  t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
}

test('rejects invalid discovery types and batch positions before upstream calls', async () => {
  assert.equal((await search(request('search?type=anything'))).status, 400);
  assert.equal((await playlist(request('playlist?url=https://youtube.com/playlist?list=PL123456789012&start=0'))).status, 400);
});

test('Data API playlist and artist search use resource-specific contracts', async t => {
  env(t, 'YOUTUBE_API_KEY', 'fixture-key');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    calls.push(url);
    const artist = url.searchParams.get('type') === 'channel';
    return Response.json({ items: [{ id: artist ? { channelId: 'UCabcdefghijklmnopqrstuv' } : { playlistId: 'PL123456789012' }, snippet: { title: 'Evening &amp; classics', channelTitle: 'Artist', thumbnails: { high: { url: 'https://i.ytimg.com/cover.jpg' } } } }] });
  });
  const playlists = await (await search(request('search?q=classics&type=playlist'))).json();
  assert.equal(playlists.results[0].kind, 'playlist');
  assert.equal(playlists.results[0].title, 'Evening & classics');
  assert.equal(calls[0].searchParams.has('videoCategoryId'), false);
  const artists = await (await search(request('search?q=artist&type=artist'))).json();
  assert.equal(artists.results[0].uploadsUrl, 'https://www.youtube.com/playlist?list=UUabcdefghijklmnopqrstuv');
  assert.equal(calls.length, 2, 'collection searches do not request video details');
});

test('extractor playlist lookup advances beyond 100 even with unavailable entries', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'music-lookup-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const extractor = join(directory, 'extractor');
  await writeFile(extractor, `#!${process.execPath}\nconst a=process.argv; const start=Number(a[a.indexOf('--playlist-start')+1]); const end=Number(a[a.indexOf('--playlist-end')+1]); if(start!==101 || end!==103) process.exit(2); process.stdout.write(JSON.stringify({title:'Full playlist', entries:[null,{id:'removed'},{id:'jNQXAC9IVRw'}]}));`, { mode: 0o755 });
  env(t, 'YT_DLP_PATH', extractor);
  env(t, 'PLAYLIST_MAX_ITEMS', '2');
  const response = await playlist(request('playlist?url=https://youtube.com/playlist?list=PL123456789012&start=101'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.nextStart, 103);
  assert.deepEqual(data.entries, []);
  assert.equal(data.sourceUrl, 'https://www.youtube.com/playlist?list=PL123456789012');
});

test('extractor collection search keeps playlist IDs and uses the requested filter', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'music-search-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const extractor = join(directory, 'extractor');
  await writeFile(extractor, `#!${process.execPath}\nconst url=new URL(process.argv.at(-1)); if(url.searchParams.get('sp')!=='EgIQAw==') process.exit(2); process.stdout.write(JSON.stringify({entries:[{id:'PL123456789012',title:'Found playlist'}]}));`, { mode: 0o755 });
  env(t, 'YT_DLP_PATH', extractor);
  env(t, 'YOUTUBE_API_KEY', null);
  const response = await search(request('search?q=classics&type=playlist'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].kind, 'playlist');
});

test('Mix lookup opens the seed video while preserving the playlist identity', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'music-mix-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const extractor = join(directory, 'extractor');
  await writeFile(extractor, `#!${process.execPath}\nif(process.argv.at(-1)!=='https://www.youtube.com/watch?v=uSiHqxgE2d0&list=RDuSiHqxgE2d0') process.exit(2); process.stdout.write(JSON.stringify({title:'Mix - Ray Charles',entries:[{id:'uSiHqxgE2d0',title:'Hit The Road Jack'}]}));`, { mode: 0o755 });
  env(t, 'YT_DLP_PATH', extractor);
  const url = 'https://youtube.com/playlist?list=RDuSiHqxgE2d0&playnext=1&si=NdxhAtGsQM8MwdsF';
  const response = await playlist(request(`playlist?url=${encodeURIComponent(url)}`));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.entries[0].externalId, 'uSiHqxgE2d0');
  assert.equal(data.sourceUrl, 'https://www.youtube.com/playlist?list=RDuSiHqxgE2d0');
  assert.equal(data.nextStart, null);
  assert.equal(data.limited, true);
});
