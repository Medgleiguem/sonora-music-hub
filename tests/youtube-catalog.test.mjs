import test from 'node:test';
import assert from 'node:assert/strict';
import { searchType, playlistStart, searchSource, catalogEntries, playlistBatch } from '../lib/youtube-catalog.mjs';

test('search types and playlist positions validate before lookup', () => {
  assert.equal(searchType(null), 'video');
  for (const type of ['video', 'playlist', 'artist']) assert.equal(searchType(type), type);
  for (const type of ['channel', 'constructor', '']) assert.throws(() => searchType(type));
  assert.equal(playlistStart(null), 1);
  assert.equal(playlistStart('101'), 101);
  for (const start of ['0', '-1', '1.5', 'Infinity', '9007199254740991', '1e2', '']) assert.throws(() => playlistStart(start));
});

test('collection search constructs filtered URLs without interpreting query text', () => {
  assert.equal(searchSource('Fairuz', 'video'), 'ytsearch24:Fairuz');
  const url = new URL(searchSource('فيروز & list=evil', 'playlist'));
  assert.equal(url.hostname, 'www.youtube.com');
  assert.equal(url.searchParams.get('search_query'), 'فيروز & list=evil');
  assert.equal(url.searchParams.get('sp'), 'EgIQAw==');
  assert.equal(new URL(searchSource('Fairuz', 'artist')).searchParams.get('sp'), 'EgIQAg==');
});

test('normalizes playlists and artist channels as collections instead of songs', () => {
  const playlist = catalogEntries({ entries: [{ id: 'PL123456789012', title: 'Evening', channel: 'Curator', thumbnails: [{ url: 'https://i.ytimg.com/cover.jpg' }], playlist_count: 120 }, { id: 'invalid' }, { id: 'UCabcdefghijklmnopqrstuv', title: 'Promoted channel' }] }, 'playlist');
  assert.equal(playlist.length, 1);
  assert.equal(playlist[0].kind, 'playlist');
  assert.equal(playlist[0].trackCount, 120);
  assert.equal(playlist[0].shareUrl, 'https://www.youtube.com/playlist?list=PL123456789012');
  const artist = catalogEntries({ entries: [{ id: 'UCabcdefghijklmnopqrstuv', title: 'Artist' }] }, 'artist')[0];
  assert.equal(artist.kind, 'artist');
  assert.equal(artist.uploadsUrl, 'https://www.youtube.com/playlist?list=UUabcdefghijklmnopqrstuv');
});

test('unavailable entries do not end a batch and continuation uses source positions', () => {
  const data = { title: 'Collection', entries: [null, { id: 'removed' }, { id: 'jNQXAC9IVRw', title: 'Next' }] };
  const batch = playlistBatch(data, { start: 101, limit: 2, sourceUrl: 'https://youtube.com/playlist?list=PL123456789012' });
  assert.equal(batch.entries.length, 0);
  assert.equal(batch.nextStart, 103);
  assert.equal(batch.total, null);
  const last = playlistBatch({ entries: [{ id: 'jNQXAC9IVRw', title: 'Last' }] }, { start: 103, limit: 2 });
  assert.equal(last.nextStart, null);
  assert.equal(last.entries[0].playlistIndex, 103);
});

test('lookahead is not downloaded twice and known totals are optional', () => {
  const batch = playlistBatch({ playlist_count: 3, entries: [{ id: 'jNQXAC9IVRw' }, { id: 'M7lc1UVf-VE' }, { id: 'BaW_jenozKc' }] }, { start: 1, limit: 2 });
  assert.equal(batch.entries.length, 2);
  assert.equal(batch.total, 3);
  assert.equal(batch.nextStart, 3);
});

test('generated Mix snapshots stop at 100 source positions without truncating saved playlists', () => {
  const entries = [{ id: 'uSiHqxgE2d0' }, { id: 'VHoT4N43jK8' }, { id: 'K5KAc5CoCuk' }];
  const sourceUrl = 'https://www.youtube.com/playlist?list=RDuSiHqxgE2d0';
  const first = playlistBatch({ entries }, { sourceUrl, start: 1, limit: 2 });
  assert.equal(first.nextStart, 3);
  const last = playlistBatch({ entries }, { sourceUrl, start: 99, limit: 2 });
  assert.equal(last.nextStart, null);
  assert.equal(last.entries.length, 2);
  assert.equal(last.entries[1].playlistIndex, 100);
  assert.equal(last.limited, true);
  const beyond = playlistBatch({ entries }, { sourceUrl, start: 101, limit: 2 });
  assert.deepEqual(beyond.entries, []);
  assert.equal(beyond.nextStart, null);
  const saved = playlistBatch({ entries }, { sourceUrl: 'https://www.youtube.com/playlist?list=PL123456789012', start: 99, limit: 2 });
  assert.equal(saved.nextStart, 101);
  assert.equal(saved.limited, false);
});
