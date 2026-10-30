// Small formatting and list helpers shared by the views.
export const formatTime = (seconds = 0) => {
  if (!Number.isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

export const formatLength = (seconds = 0) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

export const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
};

export const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

export const shuffled = (items = []) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

export const audioMimeType = (name = '') => {
  const extension = name.split('.').pop()?.toLowerCase();
  return ({
    mp3: 'audio/mpeg', wav: 'audio/wav', wave: 'audio/wav', m4a: 'audio/mp4',
    aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus',
    flac: 'audio/flac', webm: 'audio/webm'
  })[extension] || 'application/octet-stream';
};

export const initials = (value = 'Music') => value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

export function artworkHue(id = 'sonora') {
  let hash = 0;
  for (const char of String(id)) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

export const isDownloaded = (track) => Boolean(track?.blob || track?.cachedBlob);

export const greeting = (date = new Date()) => {
  const hour = date.getHours();
  return hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

// Per-device conveniences; storage can be unavailable, so every access is guarded.
export const readStored = (key, fallback) => {
  try { const value = localStorage.getItem(key); return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
};
export const writeStored = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Convenience only. */ } };
export const readPreference = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
export const writePreference = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Convenience only. */ } };

// A light copy of a track for recents: no audio, so it is safe to keep in localStorage.
export const trackSummary = ({ id, title, artist, album, cover, duration, source, externalId, shareUrl }) => ({ id, title, artist, album, cover, duration, source, externalId, shareUrl });
