import { MAX_AUDIO_BYTES } from '../lib/youtube-input.mjs';
import { isNativeAndroid, nativeAudio } from './native-media.mjs';

export async function readDownloadStream(response, onProgress = () => {}) {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || 'The download service is unavailable. Please try again.');
  }
  if (!response.headers.get('content-type')?.includes('application/x-ndjson') || !response.body) throw new Error('The download response was interrupted. Please retry.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let buffer = '';
  let metadata;
  let loaded = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'error') throw new Error(event.message || 'Conversion failed.');
        if (complete) throw new Error('Invalid download response. Please retry.');
        if (event.type === 'metadata') {
          if (metadata || !Number.isSafeInteger(event.size) || event.size <= 0 || event.size > MAX_AUDIO_BYTES) throw new Error('The audio file is empty or too large.');
          metadata = event;
        } else if (event.type === 'audio') {
          if (!metadata) throw new Error('Invalid download response. Please retry.');
          const bytes = Uint8Array.from(atob(event.data), (char) => char.charCodeAt(0));
          loaded += bytes.byteLength;
          if (loaded > metadata.size || loaded > MAX_AUDIO_BYTES) throw new Error('The audio file is too large.');
          // Small Blobs let the browser manage file data without a full-size JS byte array.
          parts.push(new Blob([bytes]));
          onProgress({ stage: 'receiving', loaded, total: metadata.size, title: metadata.title });
        } else if (event.type === 'complete') {
          if (!metadata || loaded !== metadata.size) throw new Error('The audio file is incomplete. Please retry.');
          complete = true;
        } else if (event.type === 'stage') onProgress(event);
      }
      if (buffer.length > 256 * 1024) throw new Error('Invalid download response. Please retry.');
    }
    if (!complete || buffer.trim()) throw new Error('The download was interrupted. Please retry; saved tracks are kept.');
    return { blob: new Blob(parts, { type: metadata.mime }), title: metadata.title };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function fetchYoutubeAudio(source, format, signal, onProgress) {
  // Android bounds active work in its service. Its foreground wait must remain
  // cancellable without consuming a download deadline while the app is away.
  if (isNativeAndroid()) return nativeAudio(source, format, signal, onProgress);
  const timeout = AbortSignal.timeout(285_000);
  try {
    const response = await fetch('/api/youtube/download', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: source, format }), signal: AbortSignal.any([signal, timeout])
    });
    return await readDownloadStream(response, onProgress);
  } catch (error) {
    if (timeout.aborted) throw new Error('The download timed out. Try again or choose a shorter video.');
    throw error;
  }
}
