import test from 'node:test';
import assert from 'node:assert/strict';
import { spotifySource, spotifyTrackIds, spotifyInput, nextDataJson, spotifyCollection, spotifyMatchQuery, pickSpotifyMatch, pickCloseMatch, similarWords } from '../lib/spotify-catalog.mjs';
import { canonicalSpotifyInput, spotifyPages, matchSpotifyEntry, describeSpotifyInput } from '../src/spotify-import.mjs';
import { mergeImportedTrack } from '../src/playlist-import.mjs';

const A = '37i9dQZF1DX4UtSsGT1Sbe';
const T1 = '2sFepQNyl1WjpROruP8bJ0';
const T2 = '70cHKK8bHAfJrOGVnfRG9J';
const page = entity => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity } } } } })}</script></html>`;
const listed = (id, title, subtitle, duration) => ({ uri: `spotify:track:${id}`, title, subtitle, duration, entityType: 'track' });
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('Spotify links of every shape share one canonical source', () => {
  for (const value of [`https://open.spotify.com/playlist/${A}?si=abc`, `https://open.spotify.com/intl-fr/playlist/${A}`, `https://open.spotify.com/embed/playlist/${A}`, `spotify:playlist:${A}`]) {
    assert.deepEqual(spotifySource(value), { kind: 'playlist', id: A, url: `https://open.spotify.com/playlist/${A}` });
  }
});

test('non-Spotify hosts, other pages and malformed IDs are rejected', () => {
  for (const value of [`https://evil.example/playlist/${A}`, `http://open.spotify.com/playlist/${A}`, 'https://open.spotify.com/artist/' + A, 'https://open.spotify.com/playlist/short', `https://user@open.spotify.com/playlist/${A}`]) {
    assert.throws(() => spotifySource(value));
  }
});

test('songs copied from the Spotify app are found with or without separators', () => {
  const copied = `https://open.spotify.com/track/${T1}\nhttps://open.spotify.com/track/${T2}`;
  assert.deepEqual(spotifyTrackIds(copied), [T1, T2]);
  assert.deepEqual(spotifyTrackIds(copied.replace('\n', '')), [T1, T2]);
  assert.deepEqual(spotifyInput(copied), { kind: 'tracks', ids: [T1, T2] });
  assert.equal(canonicalSpotifyInput(`${copied}\nhttps://open.spotify.com/track/${T1}`), copied);
  assert.deepEqual(describeSpotifyInput(`https://open.spotify.com/album/${A}`), { kind: 'album', songs: 0 });
  assert.equal(describeSpotifyInput('https://www.youtube.com/watch?v=jNQXAC9IVRw'), null);
});

test('embed song lists become normalized entries and report the 100-song limit', () => {
  const tracks = Array.from({ length: 100 }, (_, index) => listed(T1.slice(0, 20) + String(index).padStart(2, '0'), `Song ${index}`, 'Artist, Guest', 200_000));
  tracks.push({ uri: 'spotify:episode:xyz', title: 'Podcast', entityType: 'episode' });
  const data = spotifyCollection(nextDataJson(page({ type: 'playlist', name: 'Road trip', trackList: tracks })), spotifySource(`spotify:playlist:${A}`));
  assert.equal(data.title, 'Road trip');
  assert.equal(data.entries.length, 100);
  assert.equal(data.limited, true);
  assert.deepEqual({ ...data.entries[0], spotifyUrl: undefined }, { id: `spotify-${T1.slice(0, 20)}00`, spotifyId: `${T1.slice(0, 20)}00`, importKey: `spotify:${T1.slice(0, 20)}00`, source: 'spotify',
    title: 'Song 0', artist: 'Artist, Guest', album: '', duration: 200, cover: '', playlistIndex: 1, spotifyUrl: undefined });
});

test('a single song page carries its artists and album artwork', () => {
  const cover = 'https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02cover';
  const data = spotifyCollection(nextDataJson(page({ type: 'track', name: 'Housewife', duration: 208_810, artists: [{ name: 'Tate McRae' }],
    visualIdentity: { image: [{ url: 'https://evil.example/x.jpg', maxWidth: 300 }, { url: cover, maxWidth: 300 }] } })), spotifySource(`https://open.spotify.com/track/${T1}`));
  assert.equal(data.entries[0].artist, 'Tate McRae');
  assert.equal(data.entries[0].cover, cover);
  assert.equal(data.limited, false);
});

test('missing or private Spotify pages produce a clear error', () => {
  assert.throws(() => nextDataJson('<html></html>'), /Spotify did not return/);
  assert.throws(() => spotifyCollection(JSON.stringify({ props: { pageProps: { status: 404 } } }), spotifySource(`spotify:playlist:${A}`)), /private, removed, or unavailable/);
});

test('YouTube matching prefers the studio recording with a matching length', () => {
  const song = { title: 'Bohemian Rhapsody - Remastered 2011', artist: 'Queen', duration: 355 };
  assert.equal(spotifyMatchQuery(song), 'Queen - Bohemian Rhapsody');
  const candidates = [
    { externalId: 'live0000001', title: 'Queen - Bohemian Rhapsody (Live Aid 1985)', artist: 'Queen Official', duration: 360 },
    { externalId: 'cover000001', title: 'Bohemian Rhapsody cover', artist: 'Someone', duration: 352 },
    { externalId: 'topic000001', title: 'Bohemian Rhapsody (Remastered 2011)', artist: 'Queen - Topic', duration: 356 },
    { externalId: 'other000001', title: 'Totally different song', artist: 'Queen', duration: 355 }
  ];
  assert.equal(pickSpotifyMatch(song, candidates).externalId, 'topic000001');
  assert.equal(pickSpotifyMatch(song, [candidates[3], { externalId: 'long0000001', title: 'Queen Bohemian Rhapsody 1 hour loop', artist: 'x', duration: 3600 }]), null);
  assert.equal(pickSpotifyMatch({ title: 'Song (Live)', artist: 'Band', duration: 200 }, [{ externalId: 'live0000002', title: 'Band - Song (Live)', artist: 'Band', duration: 205 }]).externalId, 'live0000002');
});

test('matching refuses another artist or an unrequested recording version', () => {
  const adele = { title: 'Hello', artist: 'Adele', duration: 295 };
  assert.equal(pickSpotifyMatch(adele, [{ externalId: 'wrong000001', title: 'Hello', artist: 'Lionel Richie - Topic', duration: 295 }]), null);
  const queen = { title: 'Bohemian Rhapsody', artist: 'Queen', duration: 355 };
  for (const title of ['Bohemian Rhapsody cover', 'Queen - Bohemian Rhapsody (Live Aid)', 'Queen - Bohemian Rhapsody remix']) {
    assert.equal(pickSpotifyMatch(queen, [{ externalId: 'wrong000001', title, artist: 'Queen', duration: 355 }]), null);
  }
  assert.equal(pickSpotifyMatch(adele, [{ externalId: 'right000001', title: 'Adele - Hello (Official Audio)', artist: 'AdeleVEVO', duration: 295 }]).externalId, 'right000001');
});

test('pasted songs are looked up one by one and matched on YouTube', async () => {
  const requests = [];
  const request = async path => {
    requests.push(path);
    if (path.startsWith('/api/spotify/lookup')) return json({ entries: [{ spotifyId: T1, importKey: `spotify:${T1}`, source: 'spotify', title: 'Housewife', artist: 'Tate McRae', duration: 209, cover: 'https://i.scdn.co/a' }] });
    return json({ results: [{ externalId: 'jNQXAC9IVRw', title: 'Tate McRae - Housewife (Official Audio)', artist: 'Tate McRae', duration: 210, shareUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' }] });
  };
  const signal = new AbortController().signal;
  const pages = [];
  for await (const item of spotifyPages(`https://open.spotify.com/track/${T1}\nhttps://open.spotify.com/track/${T2}`, { request, signal, name: 'Mine' })) pages.push(item);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].title, 'Mine');
  assert.equal(pages[0].entries[1].playlistIndex, 2);
  assert.equal(requests.length, 0);
  const matched = await matchSpotifyEntry(pages[0].entries[0], { request, signal });
  assert.equal(matched.externalId, 'jNQXAC9IVRw');
  assert.equal(matched.title, 'Housewife');
  assert.equal(matched.cover, 'https://i.scdn.co/a');
  assert.match(requests[1], /match=1/);
});

test('an unmatched song reports its title', async () => {
  const request = async () => json({ results: [] });
  await assert.rejects(matchSpotifyEntry({ title: 'Rare', artist: 'Nobody', duration: 100 }, { request, signal: new AbortController().signal }), /No matching YouTube video found for “Rare”/);
});

test('Spotify imports are keyed by song, so a different YouTube match replaces the same entry', () => {
  let playlist = mergeImportedTrack({ trackIds: [] }, { id: 'a' }, { importKey: `spotify:${T1}`, externalId: 'jNQXAC9IVRw', playlistIndex: 1 });
  playlist = mergeImportedTrack(playlist, { id: 'b' }, { importKey: `spotify:${T1}`, externalId: 'M7lc1UVf-VE', playlistIndex: 1 });
  assert.deepEqual(playlist.trackIds, ['b']);
});

test('transliterated titles and artist names match despite different spellings', () => {
  for (const [a, b] of [['nasseeny', 'nassini'], ['fairuz', 'fayrouz'], ['ontoreeny', 'antoriny'], ['habiby', 'habibi'], ['yekhlass', 'yikhlas']]) assert.equal(similarWords(a, b), true, `${a} ~ ${b}`);
  for (const [a, b] of [['hello', 'yellow'], ['love', 'live'], ['1973', '1974'], ['sun', 'son']]) assert.equal(similarWords(a, b), false, `${a} !~ ${b}`);
  const song = { title: 'Yay Yay Ya Nasseeny - Live from Baalbeck 1973', artist: 'Fairuz', duration: 140 };
  assert.equal(pickSpotifyMatch(song, [{ externalId: 'nassini0001', title: 'Fayrouz - Yay Yay Ya Nassini', artist: 'Fayrouz', duration: 142 }]).externalId, 'nassini0001');
});

test('an Arabic-script upload of the right length by the right artist is a close match', () => {
  const song = { title: 'Sana an Sana', artist: 'Fairuz', duration: 201 };
  const arabic = { externalId: 'arabic00001', title: 'فيروز - سنة عن سنة', artist: 'Fairuz - Topic', duration: 202 };
  assert.equal(pickSpotifyMatch(song, [arabic]), null);
  assert.equal(pickCloseMatch(song, [arabic]).externalId, 'arabic00001');
  // The same artist's other song of the same length, a long version, or another singer are refused.
  assert.equal(pickCloseMatch(song, [{ externalId: 'other000001', title: 'Fairuz - Kifak Inta', artist: 'Fairuz', duration: 201 }]), null);
  assert.equal(pickCloseMatch(song, [{ ...arabic, duration: 230 }]), null);
  assert.equal(pickCloseMatch(song, [{ ...arabic, artist: 'Someone Else' }]), null);
  assert.equal(pickCloseMatch(song, [{ ...arabic, title: 'فيروز - سنة عن سنة live' }]), null);
});

test('an unmatched first search falls back to a second wording and then a close-length match', async () => {
  const queries = [];
  const request = async path => {
    const query = new URL(path, 'https://x').searchParams.get('q'); queries.push(query);
    return json({ results: queries.length === 1 ? [] : [{ externalId: 'arabic00001', title: 'فيروز - سنة عن سنة', artist: 'Fairuz - Topic', duration: 202, shareUrl: 'https://www.youtube.com/watch?v=arabic00001' }] });
  };
  const matched = await matchSpotifyEntry({ title: 'Sana an Sana', artist: 'Fairuz', duration: 201 }, { request, signal: new AbortController().signal });
  assert.equal(matched.externalId, 'arabic00001');
  assert.deepEqual(queries, ['Fairuz - Sana an Sana', 'Sana an Sana Fairuz audio']);
});
