import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeImportedTrack, canonicalPlaylistUrl, playlistPages, collectionSource, addOnlinePage } from '../src/playlist-import.mjs';

test('alternate playlist URL shapes share a canonical import identity', () => {
  assert.equal(canonicalPlaylistUrl('https://youtu.be/jNQXAC9IVRw?list=PL123456789012&si=tracking'), 'https://www.youtube.com/playlist?list=PL123456789012');
});

test('retry fills an earlier gap without losing later or manually added songs', () => {
  const later = { id: 'later', externalId: 'M7lc1UVf-VE' };
  const first = { id: 'first', externalId: 'jNQXAC9IVRw' };
  let playlist = { trackIds: ['manual'] };
  playlist = mergeImportedTrack(playlist, later, { externalId: later.externalId, playlistIndex: 2 }, []);
  playlist = mergeImportedTrack(playlist, first, { externalId: first.externalId, playlistIndex: 1 }, []);
  assert.deepEqual(playlist.trackIds, ['first', 'later', 'manual']);
});

test('a different format replaces only that imported video reference', () => {
  const old = { id: 'old', externalId: 'jNQXAC9IVRw', source: 'youtube-download' };
  const saved = { id: 'new', externalId: old.externalId };
  const playlist = { trackIds: ['old', 'manual'], importedTracks: { [old.externalId]: { trackId: 'old', position: 1 } } };
  const updated = mergeImportedTrack(playlist, saved, { externalId: old.externalId, playlistIndex: 1 }, [old]);
  assert.deepEqual(updated.trackIds, ['new', 'manual']);
  assert.deepEqual(playlist.trackIds, ['old', 'manual']);
});

test('retry preserves a manually added alternate format of the same song', () => {
  const imported = { id: 'imported-mp3', externalId: 'jNQXAC9IVRw', source: 'youtube-download' };
  const manual = { id: 'manual-opus', externalId: imported.externalId, source: 'youtube-download' };
  const playlist = { trackIds: [imported.id, manual.id, 'unrelated'], importedTracks: { [imported.externalId]: { trackId: imported.id, position: 1 } } };
  const updated = mergeImportedTrack(playlist, imported, { externalId: imported.externalId, playlistIndex: 1 }, [imported, manual]);
  assert.deepEqual(updated.trackIds, [imported.id, manual.id, 'unrelated']);
});

test('repeated source videos remain a single song at their first position', () => {
  const track = { id: 'saved', externalId: 'jNQXAC9IVRw' };
  let playlist = mergeImportedTrack({ trackIds: [] }, track, { externalId: track.externalId, playlistIndex: 1 }, []);
  playlist = mergeImportedTrack(playlist, track, { externalId: track.externalId, playlistIndex: 8 }, []);
  assert.deepEqual(playlist.trackIds, ['saved']);
  assert.equal(playlist.importedTracks[track.externalId].position, 1);
});

test('page iteration continues through an empty batch and rejects non-advancing cursors', async () => {
  const positions = [];
  const request = async path => {
    const start = Number(new URL(path, 'https://localhost').searchParams.get('start')); positions.push(start);
    return Response.json(start === 1 ? { entries: [], nextStart: 101 } : { entries: [{ externalId: 'jNQXAC9IVRw' }], nextStart: null });
  };
  const pages = [];
  for await (const page of playlistPages('https://youtube.com/playlist?list=PL123456789012', { request, signal: new AbortController().signal })) pages.push(page);
  assert.deepEqual(positions, [1, 101]);
  assert.equal(pages[1].entries[0].playlistIndex, 101);
  await assert.rejects(async () => {
    for await (const page of playlistPages('https://youtube.com/playlist?list=PL123456789012', { request: async () => Response.json({ entries: [], nextStart: 1 }), signal: new AbortController().signal })) void page;
  }, /continue/);
});

const entry = (index) => ({ id: `youtube-${String(index).padStart(11, '0')}`, externalId: String(index).padStart(11, '0'), title: `Song ${index}`, source: 'youtube', playlistIndex: index });
const lookups = (tracks = []) => ({ byId: new Map(tracks.map(track => [track.id, track])), byVideo: new Map(tracks.filter(track => track.source === 'youtube-download').map(track => [track.externalId, track])), importRunId: 'run', addedAt: 5 });

test('artist channels and playlists resolve to a canonical playlist source', () => {
  assert.equal(collectionSource({ kind: 'artist', shareUrl: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', uploadsUrl: 'https://www.youtube.com/playlist?list=UUabcdefghijklmnopqrstuv' }), 'https://www.youtube.com/playlist?list=UUabcdefghijklmnopqrstuv');
  assert.equal(collectionSource({ shareUrl: 'https://youtu.be/jNQXAC9IVRw?list=PL123456789012' }), 'https://www.youtube.com/playlist?list=PL123456789012');
});

test('an online page stores metadata-only songs in source order', () => {
  const { playlist, added } = addOnlinePage({ trackIds: [] }, [entry(2), entry(1)], lookups());
  assert.deepEqual(playlist.trackIds, [entry(1).id, entry(2).id]);
  assert.deepEqual(added.map(track => [track.source, track.addedAt, 'playlistIndex' in track, 'blob' in track]), [['youtube', 5, false, false], ['youtube', 5, false, false]]);
});

test('an online save reuses a downloaded copy and existing library songs', () => {
  const downloaded = { id: 'local-1', externalId: entry(1).externalId, source: 'youtube-download' };
  const liked = { ...entry(2), favorite: true };
  const { playlist, added } = addOnlinePage({ trackIds: [] }, [entry(1), entry(2), entry(3)], lookups([downloaded, liked]));
  assert.deepEqual(playlist.trackIds, ['local-1', entry(2).id, entry(3).id]);
  assert.deepEqual(added.map(track => track.id), [entry(3).id]);
});

test('downloading a saved online playlist later replaces online songs in place', () => {
  const online = addOnlinePage({ trackIds: [] }, [entry(1), entry(2)], lookups()).playlist;
  const offline = { id: 'local-2', externalId: entry(2).externalId, source: 'youtube-download' };
  const updated = mergeImportedTrack(online, offline, { ...entry(2), importRunId: 'download' });
  assert.deepEqual(updated.trackIds, [entry(1).id, 'local-2']);
  // Saving online again keeps the offline copy rather than reverting to streaming.
  const resaved = addOnlinePage(updated, [entry(1), entry(2)], lookups([offline])).playlist;
  assert.deepEqual(resaved.trackIds, [entry(1).id, 'local-2']);
});
