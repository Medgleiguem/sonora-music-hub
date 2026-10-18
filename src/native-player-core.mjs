const CHUNK_BYTES = 256 * 1024;
const MAX_STAGED_BYTES = 256 * 1024 * 1024;

function base64(bytes) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) text += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(text);
}

export function createNativePlayerClient(bridge) {
  const files = new Map();
  async function prepare(track, signal = new AbortController().signal) {
    signal.throwIfAborted();
    const item = {
      id: track.id, title: track.title || 'Untitled track', artist: track.artist || '', album: track.album || '',
      cover: /^https:\/\//.test(track.cover || '') ? track.cover : '',
      source: track.source || 'local', externalId: track.externalId || '', duration: Number(track.duration) || 0
    };
    const blob = track.cachedBlob || track.blob;
    if (!blob) {
      if (track.source !== 'youtube' && !/^https:\/\//.test(track.audio || track.uri || '')) throw new Error('This track has no playable audio. Import it again or choose another result.');
      return { ...item, uri: track.source === 'youtube' ? '' : track.audio || track.uri };
    }
    if (blob.size <= 0 || blob.size > MAX_STAGED_BYTES) throw new Error('Native playback supports audio files up to 256 MB. Choose a smaller file.');
    const key = `${track.id}:${blob.size}`;
    let uri = files.get(key);
    if (!uri) {
      let uploadId;
      try {
        const start = await bridge.stageStart({ id: track.id, size: blob.size });
        uploadId = start.uploadId;
        signal.throwIfAborted();
        uri = start.uri;
        if (!uri) {
          if (!uploadId) throw new Error('Could not prepare this track for background playback.');
          for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
            signal.throwIfAborted();
            const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
            signal.throwIfAborted();
            await bridge.stageChunk({ uploadId, data: base64(bytes) });
          }
          signal.throwIfAborted();
          uri = (await bridge.stageFinish({ uploadId })).uri;
          uploadId = null;
        }
        signal.throwIfAborted();
        if (!uri) throw new Error('The native audio copy could not be opened.');
        files.set(key, uri);
      } catch (error) {
        if (uploadId) await bridge.stageAbort({ uploadId }).catch(() => {});
        throw error;
      }
    }
    return { ...item, source: 'local', uri };
  }

  return {
    bridge, prepare,
    async playQueue(tracks, index = 0, { signal = new AbortController().signal, onProgress, options } = {}) {
      if (!tracks.length || index < 0 || index >= tracks.length) throw new Error('Choose a track to play.');
      if (tracks.length > 500) throw new Error('Choose a playlist or search with up to 500 tracks for the playback queue.');
      const requestId = crypto.randomUUID();
      const selected = await prepare(tracks[index], signal);
      signal.throwIfAborted();
      if (options) await bridge.setOptions(options);
      signal.throwIfAborted();
      await bridge.setQueue({ items: [selected], index: 0, position: 0, requestId });
      const prepared = [index];
      const skipped = [];
      // Start the selected song promptly. A slow or invalid later item must never
      // delay it. Native insertion preserves the existing position and source.
      for (const position of [...tracks.map((_, i) => i).filter(i => i > index), ...tracks.map((_, i) => i).filter(i => i < index)]) {
        signal.throwIfAborted();
        onProgress?.({ completed: prepared.length, total: tracks.length, started: true });
        let item;
        try { item = await prepare(tracks[position], signal); }
        catch (error) {
          signal.throwIfAborted();
          skipped.push({ id: tracks[position].id, message: error.message });
          continue;
        }
        signal.throwIfAborted();
        const insertion = prepared.filter(previous => previous < position).length;
        await bridge.insert({ item, index: insertion, requestId });
        prepared.push(position);
      }
      return { skipped };
    },
    async removeFile(id) {
      for (const key of files.keys()) if (key.startsWith(`${id}:`)) files.delete(key);
      return bridge.removeMedia({ id });
    }
  };
}
