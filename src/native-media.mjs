import { Capacitor, registerPlugin } from '@capacitor/core';
import { MAX_AUDIO_BYTES, youtubeSource, audioFormat } from '../lib/youtube-input.mjs';

const media = registerPlugin('SonoraMedia');
export const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
export const minimizeAndroid = () => media.minimize();
export const onNativeDownloadCancelled = (callback) => media.addListener('downloadCancelled', callback);
export const pendingNativeDownload = () => media.pendingDownload();
export const releaseNativeDownload = (id) => media.release({ id });
export const cancelKeptNativeDownload = (id) => media.cancel({ id });

async function waitForForeground(signal, onProgress) {
  let resume;
  let rejectWait;
  // Subscribe before checking visibility so a quick return to Sonora cannot be missed.
  const listener = await media.addListener('foreground', () => resume?.());
  const abort = () => rejectWait(signal.reason);
  try {
    for (;;) {
      const resumed = new Promise((resolve, reject) => { resume = resolve; rejectWait = reject; });
      signal.throwIfAborted();
      const { foreground } = await media.isForeground();
      signal.throwIfAborted();
      if (foreground) return;
      onProgress?.({ stage: 'waiting', message: 'Reopen Sonora to continue the remaining tracks.' });
      signal.addEventListener('abort', abort, { once: true });
      await resumed;
      signal.removeEventListener('abort', abort);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await listener.remove();
  }
}

async function operation(method, options, signal, onProgress) {
  const id = options.id || crypto.randomUUID();
  let listener;
  let started = false;
  const cancel = () => { if (started) void media.cancel({ id }).catch(() => {}); };
  try {
    signal.throwIfAborted();
    if (onProgress) listener = await media.addListener('progress', (event) => { if (event.id === id && !signal.aborted) onProgress(event); });
    signal.throwIfAborted();
    signal.addEventListener('abort', cancel, { once: true });
    started = true;
    const result = await media[method]({ ...options, id });
    signal.throwIfAborted();
    return { ...result, id };
  } catch (error) {
    await media.release({ id }).catch(() => {});
    if (signal.aborted) throw signal.reason;
    if (error.code === 'DOWNLOAD_CANCELLED') throw new DOMException(error.message, 'AbortError');
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    await listener?.remove();
  }
}

export async function youtubeRequest(path, options = {}) {
  if (!isNativeAndroid()) return fetch(path, options);
  const url = new URL(path, 'https://localhost');
  const playlist = url.pathname === '/api/youtube/playlist';
  if (!playlist && url.pathname !== '/api/youtube/search') throw new Error('Unknown music request.');
  const result = await operation(playlist ? 'playlist' : 'search', playlist
    ? { url: youtubeSource(url.searchParams.get('url'), true) }
    : { query: url.searchParams.get('q') || '' }, options.signal || AbortSignal.timeout(55_000));
  return Response.json(result);
}

export async function nativeAudio(source, format, signal, onProgress) {
  signal.throwIfAborted();
  const url = youtubeSource(source);
  const pending = await media.pendingDownload();
  const job = pending.job;
  const id = job && !job.cancelled && job.url === url && job.format === format ? job.id : undefined;
  if (!id) await waitForForeground(signal, onProgress);
  const result = await operation('download', { url, format: audioFormat(format), ...(id ? { id } : {}) }, signal, onProgress);
  const release = () => media.release({ id: result.id }).catch(() => {});
  try {
    if (!Number.isSafeInteger(result.size) || result.size <= 0 || result.size > MAX_AUDIO_BYTES) throw new Error('The audio file is empty or too large.');
    // Capacitor serves this app-owned file directly; never pass a large base64 string over the bridge.
    const response = await fetch(Capacitor.convertFileSrc(result.path), { signal });
    if (!response.ok) throw new Error('Could not read the converted audio. Please retry.');
    const blob = await response.blob();
    if (blob.size !== result.size) throw new Error('The converted file is incomplete. Please retry.');
    return { blob: new Blob([blob], { type: result.mime }), title: result.title, release, saveBackup: () => media.export({ id: result.id }) };
  } catch (error) { await release(); throw error; }
}
