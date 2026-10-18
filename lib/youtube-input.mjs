const hosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
export const formats = { mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/ogg' };
export const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 30 * 60;

export function youtubeSource(value, playlist = false) {
  if (typeof value !== 'string') throw new Error('Paste a valid YouTube URL.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Paste a valid YouTube URL.'); }
  if (value.length > 2048 || !['http:', 'https:'].includes(url.protocol) || !hosts.has(url.hostname) || url.username || url.password || url.port) {
    throw new Error('Paste a valid YouTube URL.');
  }
  if (playlist) {
    const id = url.searchParams.get('list') || '';
    if (!/^[\w-]{10,100}$/.test(id)) throw new Error('Paste a valid YouTube playlist URL.');
    return `https://www.youtube.com/playlist?list=${id}`;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const id = url.hostname === 'youtu.be' ? parts[0] : url.pathname === '/watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : '';
  if (!/^[\w-]{11}$/.test(id || '')) throw new Error('Paste a YouTube video URL with a valid video ID.');
  return `https://www.youtube.com/watch?v=${id}`;
}

export function audioFormat(value) {
  if (!Object.hasOwn(formats, value)) throw new Error('Choose MP3, M4A, or Opus.');
  return value;
}

export function validateVideo(info) {
  if (info.is_live || info.live_status === 'is_upcoming') throw new Error('Live and upcoming videos cannot be saved. Choose a finished video.');
  if (!Number.isFinite(info.duration) || info.duration <= 0) throw new Error('The video duration is unavailable. Choose another video.');
  if (info.duration > MAX_DURATION_SECONDS) throw new Error('Choose a video of 30 minutes or less. Longer conversions may exceed the hosting time limit.');
}

export function publicMediaError(error) {
  if (error.name === 'TimeoutError') return 'The converter timed out. Try again or choose a shorter video.';
  if (error.name === 'AbortError') return 'Download cancelled.';
  if (/sign in|not a bot|HTTP Error 403|HTTP Error 429/i.test(error.message)) return 'YouTube is temporarily refusing this server’s request. Try again later or import the audio file from your device.';
  if (error.code === 'ENOENT') return 'The conversion tools are unavailable. Rebuild the app with npm run build.';
  if (/private|unavailable|removed|copyright|members-only|age.restricted/i.test(error.message)) return 'This video is unavailable for download. Try another video.';
  if (/^(Choose |The video duration|Live and upcoming|The converter is busy|The audio file|The source file)/.test(error.message)) return error.message;
  return 'Could not convert this video. Try again or choose another video.';
}
