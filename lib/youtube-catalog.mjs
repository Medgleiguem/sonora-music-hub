import { youtubeMixSeed } from './youtube-input.mjs';

export function searchType(value) {
  const type = value ?? 'video';
  if (!['video', 'playlist', 'artist'].includes(type)) throw new Error('Choose Songs, Playlists, or Artists.');
  return type;
}

export function playlistStart(value) {
  if (value == null) return 1;
  const start = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(start) || start < 1 || start > 2_147_483_546) {
    throw new Error('Choose a valid playlist position.');
  }
  return start;
}

export function searchSource(term, type = 'video') {
  searchType(type);
  if (type === 'video') return `ytsearch24:${term}`;
  const params = new URLSearchParams({ search_query: term, sp: type === 'playlist' ? 'EgIQAw==' : 'EgIQAg==' });
  return `https://www.youtube.com/results?${params}`;
}

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const thumbnail = item => item.thumbnail || item.thumbnails?.findLast(image => image.url?.startsWith('https://'))?.url || '';

export function catalogEntries(data, type = 'video') {
  return (data.entries || []).flatMap((item, index) => {
    if (!item) return [];
    const id = item.id || '';
    const common = { title: item.title || item.channel || 'Untitled', artist: item.channel || item.uploader || 'YouTube', source: 'youtube' };
    if (type === 'artist') {
      if (!/^UC[\w-]{22}$/.test(id)) return [];
      return [{ ...common, id: `youtube-artist-${id}`, externalId: id, kind: 'artist', cover: thumbnail(item),
        shareUrl: `https://www.youtube.com/channel/${id}`, uploadsUrl: `https://www.youtube.com/playlist?list=UU${id.slice(2)}` }];
    }
    if (type === 'playlist') {
      if (!/^[\w-]{10,100}$/.test(id) || id.length === 11 || /^UC[\w-]{22}$/.test(id)) return [];
      return [{ ...common, id: `youtube-playlist-${id}`, externalId: id, kind: 'playlist', cover: thumbnail(item),
        trackCount: count(item.playlist_count), shareUrl: `https://www.youtube.com/playlist?list=${id}` }];
    }
    if (!/^[\w-]{11}$/.test(id)) return [];
    return [{ ...common, id: `youtube-${id}`, externalId: id, album: data.title || 'YouTube', duration: Number(item.duration) || 0,
      cover: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, shareUrl: `https://www.youtube.com/watch?v=${id}`,
      playlistIndex: item.playlist_index || index + 1 }];
  });
}

export function playlistBatch(data, { start = 1, limit = 100, sourceUrl } = {}) {
  const mix = Boolean(youtubeMixSeed(sourceUrl));
  if (mix) limit = Math.max(0, Math.min(limit, 101 - start));
  const raw = data.entries || [];
  const entries = raw.slice(0, limit).flatMap((item, index) => catalogEntries({ title: data.title, entries: item ? [{ ...item, playlist_index: start + index }] : [] }));
  return { title: data.title || 'YouTube playlist', sourceUrl, entries, nextStart: raw.length > limit && (!mix || start + limit <= 100) ? start + limit : null,
    total: mix ? null : count(data.playlist_count), limited: mix };
}
