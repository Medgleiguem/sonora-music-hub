// Spotify links are read from Spotify's public embed pages. They provide song
// titles, artists and durations; audio is matched and downloaded from YouTube.
const hosts = new Set(['open.spotify.com', 'play.spotify.com']);
const kinds = ['playlist', 'album', 'track'];
const ID = /^[A-Za-z0-9]{22}$/;
export const MAX_SPOTIFY_TRACKS = 2000;
export const SPOTIFY_EMBED_LIMIT = 100;

export function spotifySource(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Paste a valid Spotify link.');
  const uri = value.trim().match(/^spotify:(playlist|album|track):([A-Za-z0-9]{22})$/);
  if (uri) return { kind: uri[1], id: uri[2], url: `https://open.spotify.com/${uri[1]}/${uri[2]}` };
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Paste a valid Spotify link.'); }
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port) throw new Error('Paste a valid Spotify link.');
  const parts = url.pathname.split('/').filter(Boolean).filter(part => part !== 'embed' && !/^intl-[a-z]{2}(-[a-z]{2})?$/i.test(part));
  const [kind, id] = parts.length === 4 && parts[0] === 'user' ? parts.slice(2) : parts;
  if (!kinds.includes(kind) || !ID.test(id || '')) throw new Error('Paste a Spotify playlist, album, or song link.');
  return { kind, id, url: `https://open.spotify.com/${kind}/${id}` };
}

// Copying songs in the Spotify desktop app (Ctrl+A, Ctrl+C) yields one link per
// song. Single-line inputs may join them without a separator, so match globally.
export function spotifyTrackIds(text = '') {
  const ids = new Set();
  for (const match of String(text).matchAll(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/gi)) {
    ids.add(match[1]);
    if (ids.size > MAX_SPOTIFY_TRACKS) throw new Error(`Paste up to ${MAX_SPOTIFY_TRACKS} Spotify songs at a time.`);
  }
  return [...ids];
}

export function spotifyInput(value = '') {
  const text = String(value).trim();
  if (!/spotify/i.test(text)) return null;
  const ids = spotifyTrackIds(text);
  if (ids.length > 1) return { kind: 'tracks', ids };
  try {
    const source = spotifySource(text);
    return source.kind === 'track' ? { kind: 'tracks', ids: [source.id] } : { kind: 'collection', source };
  } catch { return ids.length ? { kind: 'tracks', ids } : null; }
}

export const spotifyEmbedUrl = ({ kind, id }) => `https://open.spotify.com/embed/${kind}/${id}`;

export function nextDataJson(html = '') {
  const match = String(html).match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Spotify did not return this link’s songs. Try again later.');
  return match[1];
}

const text = (value, max = 200) => String(value ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const image = entity => {
  const sources = [...(entity.coverArt?.sources || []), ...(entity.visualIdentity?.image || [])]
    .filter(item => /^https:\/\/([\w-]+\.)*(scdn\.co|spotifycdn\.com)\//.test(item?.url || ''));
  return (sources.find(item => item.maxWidth === 300) || sources.find(item => (item.maxWidth || item.width || 0) >= 300) || sources[0])?.url || '';
};

export function spotifyCollection(json, source) {
  let entity;
  try { entity = JSON.parse(json)?.props?.pageProps?.state?.data?.entity; } catch { entity = null; }
  if (!entity || entity.type !== source.kind) throw new Error('This Spotify link is private, removed, or unavailable. Make the playlist public and retry.');
  const title = text(entity.name || entity.title) || 'Spotify playlist';
  const cover = image(entity);
  const track = (id, name, artist, duration, index, trackCover = '') => ({
    id: `spotify-${id}`, spotifyId: id, importKey: `spotify:${id}`, source: 'spotify', title: text(name) || 'Untitled', artist: text(artist) || 'Unknown artist',
    album: source.kind === 'album' ? title : '', duration: Math.round((Number(duration) || 0) / 1000), cover: trackCover, playlistIndex: index,
    spotifyUrl: `https://open.spotify.com/track/${id}`
  });
  if (source.kind === 'track') {
    return { title, kind: 'track', sourceUrl: source.url, cover, limited: false, total: 1,
      entries: [track(source.id, entity.name || entity.title, (entity.artists || []).map(item => item?.name).filter(Boolean).join(', '), entity.duration, 1, cover)] };
  }
  const list = Array.isArray(entity.trackList) ? entity.trackList : [];
  const entries = list.flatMap((item, index) => {
    const id = String(item?.uri || '').match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
    return id && item.entityType !== 'episode' ? [track(id, item.title, item.subtitle, item.duration, index + 1, source.kind === 'album' ? cover : '')] : [];
  });
  return { title, kind: source.kind, sourceUrl: source.url, cover, entries, total: entries.length, limited: source.kind === 'playlist' && list.length >= SPOTIFY_EMBED_LIMIT };
}

const normalize = value => text(value, 400).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = value => normalize(value).split(' ').filter(Boolean);
// Version notes rarely appear in YouTube titles and make searches less precise.
const baseTitle = value => text(value).replace(/\s+-\s+.*\b(remaster(ed)?|mono|stereo|version|edit|bonus|anniversary|deluxe|mix|from)\b.*$/i, '')
  .replace(/\s*[([](feat\.?|ft\.?|with|from)\b[^)\]]*[)\]]/gi, '').trim() || text(value);
const primaryArtist = artist => text(artist).split(/,\s*|\s+&\s+/)[0];

export const spotifyMatchQuery = entry => `${primaryArtist(entry.artist)} - ${baseTitle(entry.title)}`.slice(0, 200);
export const spotifyFallbackQuery = entry => `${baseTitle(entry.title)} ${primaryArtist(entry.artist)} audio`.slice(0, 200);

const unwanted = ['live', 'cover', 'karaoke', 'instrumental', 'remix', 'sped', 'slowed', 'reverb', 'nightcore', '8d', 'reaction', 'tutorial', 'lesson', 'hour', 'loop', 'mashup', 'acapella', 'reversed', 'performance', 'concert', 'tour', 'session', 'festival', 'unplugged', 'rehearsal', 'pops',
  'behind', 'interview', 'teaser', 'trailer', 'snippet', 'preview', 'making', 'vlog', 'shorts', 'tiktok', 'challenge', 'explained', 'review', 'podcast', 'documentary', 'reacts'];

// Transliterated titles (Arabic, Persian, Hindi…) are spelled many ways: "Nasseeny" and "Nassini",
// "Fairuz" and "Fayrouz". Words match when they share a consonant skeleton or differ by a typo.
const skeleton = word => word.replace(/y/g, 'i').replace(/[aeiou]/g, '').replace(/(.)\1+/g, '$1');
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
export function similarWords(a, b) {
  if (a === b) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false;
  const shortest = Math.min(a.length, b.length);
  const shape = skeleton(a);
  if (shape === skeleton(b) && (shape.length >= 3 || (shortest >= 5 && shape.length >= 2))) return true;
  return shortest >= 5 && editDistance(a, b) <= (shortest >= 8 ? 2 : 1);
}
const hasWord = (found, word) => found.has(word) || [...found].some(other => similarWords(word, other));

// Articles are spelled freely in transliteration ("Al Qalb", "El Alb"), so they never decide a match.
const ARTICLES = new Set(['al', 'el', 'il', 'ul', 'the', 'a', 'an']);
const titleWords = value => { const all = words(baseTitle(value)); const kept = all.filter(word => !ARTICLES.has(word)); return kept.length ? kept : all; };

export function spotifyMatchScore(entry, candidate) {
  const wanted = titleWords(entry.title);
  const found = new Set(words(candidate.title));
  if (!wanted.length || !candidate.externalId) return -Infinity;
  const coverage = wanted.filter(word => hasWord(found, word)).length / wanted.length;
  if (coverage < 0.6) return -Infinity;
  const known = new Set(words(entry.title));
  if (unwanted.some(word => !known.has(word) && found.has(word))) return -Infinity;
  let score = coverage * 40;
  if (entry.duration && candidate.duration) {
    const difference = Math.abs(entry.duration - candidate.duration);
    if (difference > Math.max(45, entry.duration * 0.3)) return -Infinity;
    score += Math.max(0, 30 - difference);
  }
  const artist = words(primaryArtist(entry.artist));
  const channel = normalize(candidate.artist);
  const evidence = new Set([...found, ...channel.replace(/vevo$/, '').trim().split(' ')]);
  if (!artist.length || !artist.every(word => hasWord(evidence, word))) return -Infinity;
  score += 20;
  if (channel.endsWith(' topic') || /vevo$/.test(channel)) score += 15;
  if (artist.length && artist.every(word => channel.split(' ').includes(word))) score += 10;
  if (/\b(official (audio|video|music video)|audio)\b/i.test(candidate.title || '')) score += 5;
  return score;
}

export function pickSpotifyMatch(entry, candidates = []) {
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates.slice(0, 48)) {
    const score = spotifyMatchScore(entry, candidate);
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return bestScore > 25 ? best : null;
}

/**
 * A last resort when titles cannot be compared, such as an Arabic-script upload of a transliterated title:
 * the right artist, nearly the exact length, no unrequested version, and some title evidence.
 */
export function pickCloseMatch(entry, candidates = []) {
  if (!entry.duration) return null;
  const wanted = titleWords(entry.title);
  const known = new Set(words(entry.title));
  const artist = words(primaryArtist(entry.artist));
  let best = null;
  let bestDifference = Infinity;
  for (const candidate of candidates.slice(0, 48)) {
    if (!candidate.externalId || !candidate.duration) continue;
    const difference = Math.abs(entry.duration - candidate.duration);
    if (difference > Math.max(3, entry.duration * 0.02)) continue;
    const found = new Set(words(candidate.title));
    if (unwanted.some(word => !known.has(word) && found.has(word))) continue;
    const evidence = new Set([...found, ...normalize(candidate.artist).replace(/vevo$/, '').trim().split(' ')]);
    if (!artist.length || !artist.every(word => hasWord(evidence, word))) continue;
    const latin = /[a-z]/i.test(text(candidate.title).replace(/vevo|topic|official|audio|video|lyrics?/gi, ''));
    const coverage = wanted.length ? wanted.filter(word => hasWord(found, word)).length / wanted.length : 0;
    if (latin && coverage < 0.34) continue;
    if (difference < bestDifference) { best = candidate; bestDifference = difference; }
  }
  return best;
}
