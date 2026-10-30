'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSetting, putPlaylist, putTrack, setSetting, deleteTrack as removeTrack } from './db';
import { canonicalPlaylistUrl, mergeImportedTrack, onlineTrack, playlistPages } from './playlist-import.mjs';
import { isSpotifyInput, canonicalSpotifyInput, spotifyPages, matchSpotifyEntry } from './spotify-import.mjs';
import { fetchYoutubeAudio } from './download-stream.mjs';
import { isNativeAndroid, youtubeRequest, onNativeDownloadCancelled, pendingNativeDownload, releaseNativeDownload, cancelKeptNativeDownload, holdNativeDownloads, unholdNativeDownloads } from './native-media.mjs';
import { getYoutubeVideoId, isYoutubePlaylistUrl, cleanYoutubeTitle, saveRecoveryCopy } from './youtube-links.mjs';
import { createLimiter, forEachConcurrent, createMutex, retry, isRetryable } from './download-queue.mjs';

const SAVED_REQUESTS = 'androidDownloadRequests';
const LEGACY_REQUEST = 'androidDownloadRequest';
export const ACTIVE_STAGES = new Set(['preparing', 'running', 'waiting', 'stopping']);
export const isActiveJob = (job) => ACTIVE_STAGES.has(job.stage);
const songKey = (externalId, format) => `${externalId}:${format}`;
// Online songs saved for a later download carry no audio, so they persist safely across restarts.
const storable = (request) => ({ ...request, tracks: request.tracks?.map(({ blob, cachedBlob, ...track }) => track) });

async function* entriesOf(pages, onPage) {
  for await (const page of pages) {
    onPage(page);
    yield* page.entries;
  }
}

/**
 * Runs several downloads at once. Each download (a song, playlist, Spotify link, or a set of online songs to
 * keep offline) has its own progress, Stop, and Resume. Songs from every download share one limit, so
 * a second playlist starts alongside the first without overwhelming the phone.
 */
export function useDownloads(deps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const nativeAndroid = isNativeAndroid();
  const [jobs, setJobs] = useState([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const controllers = useRef(new Map());
  const limiter = useRef(null);
  limiter.current ||= createLimiter(nativeAndroid ? 3 : 2);
  // Android allows two searches at once and the app's own search needs one, so Spotify songs are matched one by one.
  const matcher = useRef(null);
  matcher.current ||= createLimiter(1);
  // Shared across downloads, so the same song requested twice downloads once.
  const inflight = useRef(new Map());
  const savedSongs = useRef(new Map());
  const restored = useRef(false);

  const update = useCallback((id, values) => setJobs((items) => items.map((job) => job.id === id ? { ...job, ...(typeof values === 'function' ? values(job) : values) } : job)), []);

  const run = useCallback(async (id, inputRequest) => {
    const { notify, protectDeviceStorage, refreshStorage, storeYoutubeDownload, updateTrack, onSingleSaved } = depsRef.current;
    let request = inputRequest;
    try {
      if (request.url && isSpotifyInput(request.url)) request = { ...request, url: canonicalSpotifyInput(request.url), track: null };
      else if (request.url && isYoutubePlaylistUrl(request.url)) request = { ...request, url: canonicalPlaylistUrl(request.url) };
    } catch (error) {
      update(id, { stage: 'error', message: error.message });
      notify(error.message, 'error');
      return;
    }
    const { url, format, addAfterDownload = false, keepBackup = false } = request;
    // An online import stores each matched song's details only; nothing is downloaded.
    const online = Boolean(request.online);
    const songsMode = Array.isArray(request.tracks);
    const spotify = !songsMode && isSpotifyInput(url);
    // Pasted Spotify songs have no playlist link; their chosen name identifies the collection.
    const spotifySongs = spotify && url.includes('/track/');
    const spotifyName = spotifySongs ? (request.name || '').trim().slice(0, 48) : '';
    const isPlaylist = !songsMode && (spotify ? !spotifySongs || url.includes('\n') || Boolean(spotifyName) : isYoutubePlaylistUrl(url));
    const track = !songsMode && request.track && getYoutubeVideoId(request.track.shareUrl) === getYoutubeVideoId(url) ? request.track : null;
    const controller = new AbortController();
    controllers.current.set(id, controller);
    const failed = [];
    const failedEntries = [];
    // The first pass retries temporary errors patiently; the final pass tries each leftover song once more.
    let retryDelays = [1500, 4000, 9000];
    let saved = 0, processed = 0, total = songsMode ? request.tracks.length : isPlaylist ? 0 : 1;
    let playlist = null, savedPlaylist = null, firstSaved = null, nextSlot = 0, listed = 0;
    const seen = new Set();
    const importRunId = crypto.randomUUID();
    const lockPlaylist = createMutex();
    const { tracks, playlists } = depsRef.current;
    const existingByVideo = new Map(tracks.filter((item) => item.source === 'youtube-download' && item.externalId && item.fileName?.toLowerCase().endsWith(`.${format}`)).map((item) => [item.externalId, item]));
    const anyDownloadByVideo = new Map(tracks.filter((item) => item.source === 'youtube-download' && item.externalId).map((item) => [item.externalId, item]));
    const progress = (values) => update(id, { ...values, failed: [...failed], saved, completed: processed, total });
    progress({ stage: 'preparing', request, message: '', songs: {}, title: request.title || track?.title || '', playlistId: request.playlistId || null, spotifyLimited: '' });

    const existingPlaylist = () => savedPlaylist || depsRef.current.playlists.find((item) => {
      if (spotifySongs) return /^(https:\/\/open\.spotify\.com\/|spotify:songs$)/.test(item.sourceUrl || '') && item.name.toLowerCase() === (spotifyName || 'Spotify songs').toLowerCase();
      if (spotify) return item.sourceUrl === url;
      try { return item.sourceUrl && canonicalPlaylistUrl(item.sourceUrl) === url; } catch { return false; }
    });
    // Each addition is persisted at once, so stopping or leaving keeps completed work.
    const keepInPlaylist = (song, entry) => lockPlaylist(async () => {
      if (!playlist) return;
      const before = existingPlaylist() || {
        id: crypto.randomUUID(), name: spotifyName || playlist.title || 'YouTube playlist', sourceUrl: spotifySongs ? 'spotify:songs' : url, trackIds: [], createdAt: Date.now()
      };
      const after = mergeImportedTrack({ ...before, sourceUrl: spotifySongs ? before.sourceUrl : url }, song, { ...entry, importRunId });
      await putPlaylist(after);
      savedPlaylist = after;
      const { setPlaylists, setSelectedPlaylist, setTracks } = depsRef.current;
      setPlaylists((items) => items.some((item) => item.id === after.id) ? items.map((item) => item.id === after.id ? after : item) : [...items, after]);
      setSelectedPlaylist((item) => item?.id === after.id ? after : item);
      update(id, { playlistId: after.id, title: after.name });
      // An online song replaced by its download is dropped unless it is liked or used by another playlist.
      const { tracks: library, playlists: others } = depsRef.current;
      const replaced = before.trackIds.filter((trackId) => {
        const item = library.find((stored) => stored.id === trackId);
        return !after.trackIds.includes(trackId) && item?.onlineImport && !item.favorite && !others.some((other) => other.id !== after.id && other.trackIds.includes(trackId));
      });
      if (replaced.length) {
        await Promise.all(replaced.map((trackId) => removeTrack(trackId)));
        setTracks((items) => items.filter((item) => !replaced.includes(item.id)));
      }
    });

    // Downloads one song's audio, sharing an identical request already running in another download.
    const fetchSong = (item, slot) => {
      const key = songKey(item.externalId, format);
      const running = inflight.current.get(key);
      if (running) return running;
      const task = limiter.current.run(async () => {
        let lastProgress = 0;
        update(id, (job) => ({ songs: { ...job.songs, [slot]: { title: item.title || 'YouTube song', stage: 'preparing' } } }));
        const source = item.shareUrl || (item.externalId ? `https://www.youtube.com/watch?v=${item.externalId}` : url);
        const audio = await retry(() => fetchYoutubeAudio(source, format, controller.signal, (event) => {
          // Avoid re-rendering the library for every network chunk.
          if (event.stage === 'receiving' && event.loaded !== event.total && Date.now() - lastProgress < 250) return;
          if (event.stage === 'downloading' && event.loaded && Date.now() - lastProgress < 250) return;
          lastProgress = Date.now();
          update(id, (job) => ({
            stage: event.stage === 'waiting' ? 'waiting' : job.stage === 'stopping' ? 'stopping' : 'running',
            message: event.stage === 'waiting' ? event.message : job.message,
            songs: job.songs[slot] ? { ...job.songs, [slot]: { ...job.songs[slot], stage: event.stage, loaded: event.loaded || 0, total: event.total || 0 } } : job.songs
          }));
        }), { signal: controller.signal, delays: retryDelays, onRetry: () => update(id, (job) => ({ songs: job.songs[slot] ? { ...job.songs, [slot]: { ...job.songs[slot], stage: 'retrying' } } : job.songs })) });
        try {
          controller.signal.throwIfAborted();
          const title = item.source === 'spotify' ? item.title : songsMode ? item.title : cleanYoutubeTitle(audio.title);
          const fileName = `${cleanYoutubeTitle(title)}.${format}`;
          update(id, (job) => ({ songs: job.songs[slot] ? { ...job.songs, [slot]: { ...job.songs[slot], title, stage: 'storing' } } : job.songs }));
          const stored = songsMode
            ? await keepOffline(item, audio.blob, fileName, format)
            : await storeYoutubeDownload(audio.blob, fileName, { ...item, title, album: item.album || (item.source === 'spotify' ? 'Spotify imports' : '') });
          if (keepBackup) {
            try { if (audio.saveBackup) await audio.saveBackup(); else saveRecoveryCopy(audio.blob, fileName); }
            catch (error) { notify(error.message, 'error'); }
          }
          return stored;
        } finally { await audio.release?.(); }
      }, controller.signal);
      inflight.current.set(key, task);
      task.then((stored) => { if (!songsMode) savedSongs.current.set(key, stored); }, () => {}).finally(() => inflight.current.delete(key));
      return task;
    };

    // Attaches downloaded audio to an online song in place, so likes and playlists keep pointing at it.
    const keepOffline = async (item, blob, fileName, songFormat) => {
      const current = depsRef.current.tracks.find((stored) => stored.id === item.id) || item;
      const updated = { ...current, cachedBlob: blob, fileName, fileType: blob.type, downloadedFormat: songFormat };
      await updateTrack(updated);
      return updated;
    };

    // Reuses the library's copy of a song (downloaded or online) before adding a new online entry.
    const keepOnline = async (item) => {
      const library = depsRef.current.tracks;
      const existing = library.find((stored) => stored.id === item.id || stored.id === `youtube-${item.externalId}`)
        || library.find((stored) => stored.externalId === item.externalId && (stored.blob || stored.cachedBlob));
      if (existing) return isPlaylist || existing.favorite ? existing : updateTrack({ ...existing, favorite: true }).then(() => ({ ...existing, favorite: true }));
      const { spotifyId, spotifyUrl, pending, ...entry } = item;
      // A single song with no playlist is kept in Liked songs so it is easy to find.
      const song = { ...onlineTrack({ ...entry, id: `youtube-${item.externalId}`, source: 'youtube' }, Date.now()), favorite: !isPlaylist };
      await putTrack(song);
      depsRef.current.setTracks((items) => [song, ...items]);
      return song;
    };

    const downloadEntry = async (listed) => {
      const key = listed.importKey || listed.externalId || listed.id;
      if (seen.has(key)) return;
      seen.add(key);
      const slot = nextSlot++;
      let item = listed;
      try {
        let song;
        if (songsMode) {
          const current = depsRef.current.tracks.find((stored) => stored.id === item.id);
          // A song removed from the library since this download was queued is skipped.
          if (!current) return;
          if (current.cachedBlob || current.blob) song = current;
          else {
            // A copy already downloaded in any format is reused instead of downloading again.
            const copy = anyDownloadByVideo.get(item.externalId);
            if (copy?.blob) song = await keepOffline(item, copy.blob, copy.fileName, copy.fileName?.split('.').pop());
          }
        } else {
          song = existingByVideo.get(item.externalId) || savedSongs.current.get(songKey(item.externalId, format));
          if (!song && item.source === 'spotify') {
            // A retry reuses songs this import already saved without searching again.
            const previous = existingPlaylist()?.importedTracks?.[key];
            song = previous && depsRef.current.tracks.find((stored) => stored.id === previous.trackId && stored.fileName?.toLowerCase().endsWith(`.${format}`));
            if (!song) {
              update(id, (job) => ({ songs: { ...job.songs, [slot]: { title: `Finding “${item.title || 'song'}” on YouTube…`, stage: 'preparing' } } }));
              const entry = item;
              item = await matcher.current.run(() => retry(() => matchSpotifyEntry(entry, { request: youtubeRequest, signal: controller.signal }), { signal: controller.signal, delays: retryDelays }), controller.signal);
              song = existingByVideo.get(item.externalId) || savedSongs.current.get(songKey(item.externalId, format));
            }
          }
        }
        if (!song && online) song = await keepOnline(item);
        if (!song) song = await fetchSong(item, slot);
        firstSaved ||= song;
        saved++;
        if (!songsMode) await keepInPlaylist(song, item);
      } catch (error) {
        if (error.name === 'AbortError') controller.abort(error);
        if (controller.signal.aborted) throw error;
        const songTitle = error.song?.title || item.title || `Song ${slot + 1}`;
        const songArtist = error.song?.artist || item.artist || '';
        failed.push({ title: songTitle, artist: songArtist, message: error.message || 'Could not download this song.', query: `${songArtist} ${songTitle}`.trim() });
        failedEntries.push({ listed, record: failed.at(-1), retryable: isRetryable(error) });
        if (error.name === 'QuotaExceededError') throw error;
      } finally {
        processed++;
        update(id, (job) => {
          const songs = { ...job.songs };
          delete songs[slot];
          return { songs, failed: [...failed], saved, completed: processed, total: Math.max(total, processed) };
        });
      }
    };

    try {
      // Started while Sonora is visible, so the whole download can continue after leaving the app.
      if (nativeAndroid) await holdNativeDownloads(id).catch(() => {});
      await protectDeviceStorage();
      controller.signal.throwIfAborted();
      const items = songsMode ? request.tracks
        : entriesOf(spotify ? spotifyPages(url, { request: youtubeRequest, signal: controller.signal, name: spotifyName })
          : isPlaylist ? playlistPages(url, { request: youtubeRequest, signal: controller.signal })
          : [{ entries: [{ ...(track || {}), externalId: track?.externalId || getYoutubeVideoId(url), shareUrl: url, source: 'youtube' }], total: 1 }],
        (page) => {
          if (isPlaylist) playlist = page;
          listed += page.entries.length;
          total = page.total || (page.nextStart ? 0 : listed);
          update(id, (job) => ({ total, title: job.title || spotifyName || page.title || '' }));
        });
      update(id, { stage: 'running' });
      await forEachConcurrent(items, nativeAndroid ? 3 : 2, downloadEntry, controller.signal);
      // One more calm pass for songs that failed while YouTube was busy, before asking the user to do anything.
      const again = failedEntries.splice(0).filter((failure) => failure.retryable);
      if (again.length) {
        const retryable = again.map((failure) => failure.listed);
        for (const failure of again) failed.splice(failed.indexOf(failure.record), 1);
        processed -= retryable.length;
        for (const entry of retryable) seen.delete(entry.importKey || entry.externalId || entry.id);
        update(id, { failed: [...failed], completed: processed, message: `Retrying ${retryable.length} ${retryable.length === 1 ? 'song' : 'songs'}…` });
        await new Promise((resolve) => setTimeout(resolve, 3000));
        retryDelays = [2000];
        await forEachConcurrent(retryable, 1, downloadEntry, controller.signal);
      }
      if (!seen.size) throw new Error(spotify ? 'This Spotify link has no songs.' : 'This playlist has no downloadable videos.');
      await refreshStorage();
      const stage = !saved ? 'error' : failed.length ? 'partial' : 'complete';
      const name = savedPlaylist?.name || request.title || firstSaved?.title || 'Your download';
      progress({
        stage, songs: {}, total: total || processed, acknowledged: false, ...(!isPlaylist && firstSaved ? { title: firstSaved.title } : {}),
        message: !saved && failed.length ? failed[0].message : `${saved} ${saved === 1 ? 'song' : 'songs'} ${online ? 'added' : 'saved'}${savedPlaylist ? ` to “${savedPlaylist.name}”` : ''}${online ? ' · plays online' : ''}.`,
        spotifyLimited: spotify && playlist?.limited ? savedPlaylist?.name || playlist.title : ''
      });
      if (!isPlaylist && !songsMode && firstSaved && addAfterDownload) onSingleSaved?.(firstSaved);
      notify(failed.length ? `“${name}”: ${saved} ${online ? 'added' : 'saved'}, ${failed.length} not found. Open Downloads to retry.`
        : online ? `“${name}” is in your library and plays online.` : `“${name}” is ready to play offline.`, failed.length ? 'error' : 'success');
    } catch (error) {
      const stopped = controller.signal.aborted;
      const kept = !saved ? 'Nothing was saved yet.' : `${saved} ${saved === 1 ? 'song is' : 'songs are'} kept.`;
      progress({ stage: stopped ? 'stopped' : 'error', songs: {}, message: stopped ? `${kept} Resume to continue.` : error.message || 'Could not start the download.' });
      if (!stopped) notify(error.message || 'Could not start the download.', 'error');
    } finally {
      if (nativeAndroid) void unholdNativeDownloads(id);
      if (controllers.current.get(id) === controller) controllers.current.delete(id);
    }
  }, [nativeAndroid, update]);

  const start = useCallback((request) => {
    const same = jobsRef.current.find((job) => isActiveJob(job) && job.request.format === request.format && Boolean(job.request.online) === Boolean(request.online)
      && (request.url ? job.request.url === request.url : request.playlistId && job.request.playlistId === request.playlistId));
    if (same) { depsRef.current.notify(request.online ? 'This is already being added.' : 'This is already downloading.'); return same.id; }
    const id = crypto.randomUUID();
    setJobs((items) => [{ id, request, stage: 'preparing', title: request.title || request.track?.title || '', saved: 0, completed: 0, total: 0, failed: [], songs: {}, createdAt: Date.now() }, ...items]);
    void run(id, request);
    return id;
  }, [run]);

  const stop = useCallback((id) => {
    const controller = controllers.current.get(id);
    if (!controller) return;
    update(id, { stage: 'stopping', message: 'Stopping… finished songs are kept.' });
    controller.abort(new DOMException('Download stopped.', 'AbortError'));
  }, [update]);

  const resume = useCallback((id) => {
    const job = jobsRef.current.find((item) => item.id === id);
    if (!job || controllers.current.has(id)) return;
    void run(id, job.request);
  }, [run]);

  const remove = useCallback(async (id) => {
    const job = jobsRef.current.find((item) => item.id === id);
    controllers.current.get(id)?.abort(new DOMException('Download removed.', 'AbortError'));
    setJobs((items) => items.filter((item) => item.id !== id));
    if (job?.nativeJobId) {
      await cancelKeptNativeDownload(job.nativeJobId).catch(() => {});
      await releaseNativeDownload(job.nativeJobId).catch(() => {});
    }
  }, []);

  // Seen problems stop calling for attention; a later run that ends badly shows them again.
  const acknowledge = useCallback(() => setJobs((items) => items.map((job) => isActiveJob(job) || job.acknowledged ? job : { ...job, acknowledged: true })), []);

  const clearFinished = useCallback(() => setJobs((items) => items.filter((job) => job.stage !== 'complete')), []);

  // The notification's Cancel all, or Android stopping the service, stops every download.
  useEffect(() => {
    if (!nativeAndroid) return;
    const listener = onNativeDownloadCancelled(() => { for (const controller of controllers.current.values()) controller.abort(new DOMException('Cancelled from the notification.', 'AbortError')); });
    return () => { void listener.then((subscription) => subscription.remove()).catch(() => {}); };
  }, [nativeAndroid]);

  // Android can close Sonora mid-download; unfinished downloads are kept so they can be resumed.
  const persisted = useMemo(() => JSON.stringify(jobs.filter((job) => job.stage !== 'complete').map((job) => ({
    id: job.id, request: storable(job.request), title: job.title, stage: isActiveJob(job) ? 'interrupted' : job.stage, saved: job.saved || 0, total: job.total || 0
  }))), [jobs]);
  useEffect(() => {
    if (!nativeAndroid || !restored.current) return;
    void setSetting(SAVED_REQUESTS, JSON.parse(persisted)).catch(() => {});
  }, [nativeAndroid, persisted]);

  useEffect(() => {
    if (!nativeAndroid || !deps.libraryReady || restored.current) return;
    restored.current = true;
    void Promise.all([getSetting(SAVED_REQUESTS, []), getSetting(LEGACY_REQUEST, null), pendingNativeDownload().catch(() => ({}))]).then(async ([saved, legacy, pending]) => {
      const entries = [...(saved || []), ...(legacy ? [{ id: crypto.randomUUID(), request: legacy }] : [])];
      const native = pending.jobs || (pending.job ? [pending.job] : []);
      for (const job of native) {
        if (entries.some((entry) => entry.request.url === job.url || entry.request.tracks?.some((item) => item.shareUrl && getYoutubeVideoId(item.shareUrl) === getYoutubeVideoId(job.url)))) continue;
        // A finished single song already in the library needs nothing more.
        if (depsRef.current.tracks.some((item) => item.externalId === getYoutubeVideoId(job.url) && item.fileName?.endsWith(`.${job.format}`))) { await releaseNativeDownload(job.id).catch(() => {}); continue; }
        entries.push({ id: crypto.randomUUID(), request: { url: job.url, format: job.format, keepBackup: true }, nativeJobId: job.id });
      }
      if (legacy) await setSetting(LEGACY_REQUEST, null).catch(() => {});
      if (!entries.length) return;
      // Downloads the user stopped stay stopped; only work cut off by Android is reported as interrupted.
      const messages = {
        stopped: 'Stopped. Resume to continue; saved songs are kept.',
        partial: 'Some songs could not be downloaded. Resume to retry them.',
        error: 'This download failed. Resume to try again.',
        interrupted: 'Interrupted when Sonora closed. Resume to continue; saved songs are kept.'
      };
      setJobs((items) => [...items, ...entries.filter((entry) => !items.some((item) => item.id === entry.id)).map((entry) => {
        const stage = entry.nativeJobId || !messages[entry.stage] ? 'interrupted' : entry.stage;
        return {
          id: entry.id, request: entry.request, title: entry.title || entry.request.title || entry.request.track?.title || '', stage, nativeJobId: entry.nativeJobId,
          saved: entry.saved || 0, completed: entry.saved || 0, total: entry.total || 0, failed: [], songs: {}, autoResume: stage === 'interrupted',
          message: entry.nativeJobId ? 'This song finished downloading while Sonora was closed. Resume to save it.' : messages[stage]
        };
      })]);
    }).catch(() => {});
  }, [nativeAndroid, deps.libraryReady]);

  // Work Android cut off continues by itself when Sonora opens again; downloads the user stopped stay stopped.
  useEffect(() => {
    for (const job of jobs) {
      if (!job.autoResume || controllers.current.has(job.id)) continue;
      update(job.id, { autoResume: false });
      void run(job.id, job.request);
    }
  }, [jobs, run, update]);

  const active = jobs.filter(isActiveJob);
  return { jobs, active, start, stop, resume, remove, clearFinished, acknowledge };
}
