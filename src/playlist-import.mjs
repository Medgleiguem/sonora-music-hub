import { youtubeSource } from '../lib/youtube-input.mjs';
import { playlistStart } from '../lib/youtube-catalog.mjs';

export const canonicalPlaylistUrl = value => youtubeSource(value, true);
// Artist channels are read through their uploads playlist.
export const collectionSource = collection => canonicalPlaylistUrl(collection.uploadsUrl || collection.shareUrl);

// An online song keeps only catalog details; playback resolves its audio when played.
export function onlineTrack(entry, addedAt) {
  const { playlistIndex, importKey, importRunId, ...track } = entry;
  // Marked so a later download can tidy it away without touching songs the user saved by hand.
  return { ...track, source: 'youtube', addedAt, favorite: false, onlineImport: true };
}

/**
 * Adds one metadata page to a saved online playlist without downloading audio.
 * A song already in the library (including a downloaded copy of the same video) is reused.
 */
export function addOnlinePage(playlist, entries, { byId, byVideo, importRunId, addedAt }) {
  const added = [];
  let updated = playlist;
  for (const entry of entries) {
    const previous = byId.get(updated.importedTracks?.[entry.importKey || entry.externalId]?.trackId);
    let track = previous && previous.source !== 'youtube' ? previous : byVideo.get(entry.externalId) || previous || byId.get(entry.id);
    if (!track) {
      track = onlineTrack(entry, addedAt);
      byId.set(track.id, track);
      added.push(track);
    }
    updated = mergeImportedTrack(updated, track, { ...entry, importRunId });
  }
  return { playlist: updated, added };
}

export async function* playlistPages(url, { request, signal }) {
  const source = canonicalPlaylistUrl(url);
  let start = 1;
  while (start != null) {
    signal.throwIfAborted();
    const params = new URLSearchParams({ url: source, start: String(start) });
    const response = await request(`/api/youtube/playlist?${params}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(55_000)]) });
    const page = await response.json();
    if (!response.ok) throw new Error(page.error || 'Could not read that playlist.');
    if (!Array.isArray(page.entries)) throw new Error('Could not read that playlist.');
    const next = page.nextStart == null ? null : playlistStart(page.nextStart);
    if (next != null && next <= start) throw new Error('Could not continue this playlist. Retry to continue.');
    yield { ...page, sourceUrl: source, entries: page.entries.map((entry, index) => ({ ...entry, playlistIndex: entry.playlistIndex || start + index })) };
    start = next;
  }
}

// Source positions let a later retry insert an earlier song without losing saved work.
export function mergeImportedTrack(playlist, saved, entry) {
  const importedTracks = Object.fromEntries(Object.entries(playlist.importedTracks || {}).filter(([, item]) => playlist.trackIds.includes(item.trackId)));
  const key = entry.importKey || entry.externalId;
  const previous = importedTracks[key];
  const position = previous?.runId === entry.importRunId ? Math.min(previous?.position ?? Infinity, entry.playlistIndex) : entry.playlistIndex;
  importedTracks[key] = { trackId: saved.id, position, ...(entry.importRunId ? { runId: entry.importRunId } : {}) };
  // Only replace a reference whose import provenance is recorded. Other formats
  // may have been added by the user and must remain in the collection.
  const replaced = new Set(previous ? [previous.trackId] : []);
  const ordered = Object.values(importedTracks).sort((a, b) => a.position - b.position).map(item => item.trackId);
  const importedIds = new Set(ordered);
  const extra = playlist.trackIds.filter(id => !importedIds.has(id) && !replaced.has(id));
  return { ...playlist, importedTracks, trackIds: [...new Set([...ordered, ...extra])] };
}
