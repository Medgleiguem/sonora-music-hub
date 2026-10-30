import { spotifyInput, spotifyMatchQuery, spotifyFallbackQuery, pickSpotifyMatch, pickCloseMatch } from '../lib/spotify-catalog.mjs';
import { retry } from './download-queue.mjs';

export const isSpotifyInput = value => {
  try { return Boolean(spotifyInput(value)); } catch { return false; }
};

// Stable text keeps retries and the Android recovery request comparable.
export function canonicalSpotifyInput(value) {
  const input = spotifyInput(value);
  if (!input) throw new Error('Paste a Spotify playlist, album, or song link.');
  return input.kind === 'collection' ? input.source.url : input.ids.map(id => `https://open.spotify.com/track/${id}`).join('\n');
}

async function readJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}

// Spotify's page can be slow or briefly refuse; a temporary failure should not end the whole import.
const lookup = (url, { request, signal }) => retry(async () => readJson(
  await request(`/api/spotify/lookup?${new URLSearchParams({ url })}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) }),
  'Could not read this Spotify link.'), { signal, delays: [2000, 5000] });

export async function* spotifyPages(value, { request, signal, name }) {
  const input = spotifyInput(value);
  if (!input) throw new Error('Paste a Spotify playlist, album, or song link.');
  if (input.kind === 'collection') {
    const data = await lookup(input.source.url, { request, signal });
    if (!Array.isArray(data.entries)) throw new Error('Could not read this Spotify link.');
    yield data;
    return;
  }
  // Song details are read as each song is reached, so a long list starts saving immediately.
  yield { title: name || 'Spotify songs', kind: 'tracks', sourceUrl: '', total: input.ids.length, limited: false,
    entries: input.ids.map((id, index) => ({ id: `spotify-${id}`, spotifyId: id, importKey: `spotify:${id}`, source: 'spotify', title: '',
      playlistIndex: index + 1, spotifyUrl: `https://open.spotify.com/track/${id}`, pending: true })) };
}

export async function matchSpotifyEntry(entry, { request, signal }) {
  let song = entry;
  if (entry.pending) {
    const data = await lookup(entry.spotifyUrl, { request, signal });
    const [details] = data.entries || [];
    if (!details) throw new Error('This Spotify song is unavailable.');
    song = { ...details, playlistIndex: entry.playlistIndex };
  }
  const search = async (q) => {
    const params = new URLSearchParams({ q, type: 'video', match: '1' });
    const results = await readJson(
      await request(`/api/youtube/search?${params}`, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(55_000)]) }),
      'YouTube search failed.');
    return results.results || [];
  };
  // Each wording widens the pool: "Artist - Title", then "Title Artist audio". Close-length uploads
  // from the right artist are the last resort, for titles spelled differently or written in Arabic.
  const pool = [];
  let match = null;
  for (const query of [spotifyMatchQuery(song), spotifyFallbackQuery(song)]) {
    pool.push(...await search(query));
    match = pickSpotifyMatch(song, pool);
    if (match) break;
  }
  match ||= pickCloseMatch(song, pool);
  if (!match) throw Object.assign(new Error(`No matching YouTube video found for “${song.title}”.`), { song });
  return { ...song, externalId: match.externalId, shareUrl: match.shareUrl, cover: song.cover || match.cover || '', duration: song.duration || match.duration || 0 };
}

export function describeSpotifyInput(value) {
  try {
    const input = spotifyInput(value);
    return !input ? null : input.kind === 'collection' ? { kind: input.source.kind, songs: 0 } : { kind: 'songs', songs: input.ids.length };
  } catch (error) { return { kind: 'error', songs: 0, error: error.message }; }
}
