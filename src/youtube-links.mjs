// YouTube link parsing and small download helpers shared by the app and its download manager.
export const decodeEntities = (value = '') => {
  const node = document.createElement('textarea');
  node.innerHTML = value;
  return node.value;
};

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

export const isYoutubeUrl = (value = '') => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

export const isYoutubePlaylistUrl = (value = '') => {
  try {
    const parsed = new URL(value);
    return isYoutubeUrl(value) && (parsed.pathname === '/playlist' || parsed.searchParams.has('list'));
  } catch {
    return false;
  }
};

export const getYoutubeVideoId = (value = '') => {
  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
    const parts = parsed.pathname.split('/').filter(Boolean);
    return ['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] || '' : '';
  } catch {
    return '';
  }
};

export const cleanYoutubeTitle = (value = '') => {
  try {
    return decodeEntities(decodeURIComponent(value)).replace(/[\\/:*?"<>|]+/g, '').trim() || 'YouTube audio';
  } catch {
    return decodeEntities(value).replace(/[\\/:*?"<>|]+/g, '').trim() || 'YouTube audio';
  }
};

export const saveRecoveryCopy = (blob, fileName) => {
  if (!blob || typeof document === 'undefined') return;
  const backupUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = backupUrl;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(backupUrl), 30_000);
};

// An online song plays from YouTube until a downloaded copy is attached to it.
export const isOnlineOnly = (track) => track?.source === 'youtube' && !track.blob && !track.cachedBlob;
