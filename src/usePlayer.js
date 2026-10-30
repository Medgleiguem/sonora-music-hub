'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { nativePlayer } from './native-player.mjs';
import { isOnlineOnly } from './youtube-links.mjs';
import { shuffled } from './ui/format';

/**
 * Playback for both runtimes: the browser plays files with an <audio> element and online songs
 * through the visible YouTube player; Android plays everything natively and reports its state here.
 */
export function usePlayer({ nativeAndroid, tracks, knownTracks, notify }) {
  const audioRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const nativePrepareRef = useRef(null);
  const nativeTracksRef = useRef(new Map());
  const nativeStateRef = useRef(null);
  const nativeErrorRef = useRef('');
  // The song just chosen; Android's updates about the previous song are ignored until it switches.
  const pendingIdRef = useRef(null);
  const [current, setCurrent] = useState(null);
  const [queue, setQueue] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [nativePlaybackStatus, setNativePlaybackStatus] = useState('');
  const [nativePlaybackError, setNativePlaybackError] = useState('');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    return () => { audio.pause(); audio.removeAttribute('src'); audio.load(); audioRef.current = null; };
  }, []);

  const playerCommand = useCallback((method, options) => {
    return nativePlayer.bridge[method](options).catch(error => {
      notify(error.message || 'Playback could not be updated. Please retry.', 'error');
    });
  }, [notify]);

  useEffect(() => {
    nativeTracksRef.current = new Map([...queue, ...knownTracks, ...tracks].map(track => [track.id, track]));
    if (nativeAndroid) setCurrent(previous => {
      const stored = previous && tracks.find(track => track.id === previous.id);
      return stored ? { ...previous, ...stored } : previous;
    });
  }, [tracks, knownTracks, queue, nativeAndroid]);

  useEffect(() => {
    if (!nativeAndroid) return;
    let disposed = false;
    const update = state => {
      if (disposed || !state) return;
      nativeStateRef.current = state;
      const items = Array.isArray(state.items) ? state.items : [];
      const restored = items.map(item => ({ ...item, ...(nativeTracksRef.current.get(item.id) || {}), audio: item.uri || undefined }));
      setQueue(previous => previous.length === restored.length && previous.every((track, index) => track.id === restored[index].id) ? previous : restored);
      const active = restored.find(track => track.id === state.currentId);
      if (pendingIdRef.current && state.currentId === pendingIdRef.current) pendingIdRef.current = null;
      if (!pendingIdRef.current) {
        setCurrent(previous => active ? previous?.id === active.id ? previous : active : null);
        setPlaying(Boolean(state.playing));
        setProgress(Number(state.position) || 0);
        setDuration(Number(state.duration) || active?.duration || 0);
      }
      if (state.repeat) setRepeat(state.repeat);
      if (typeof state.shuffle === 'boolean') setShuffle(state.shuffle);
      if (typeof state.volume === 'number') setVolume(state.volume);
      if (typeof state.muted === 'boolean') setMuted(state.muted);
      if (!nativePrepareRef.current) setNativePlaybackStatus(state.buffering ? 'Loading…' : '');
      if (state.error && state.error !== nativeErrorRef.current) notify(state.error, 'error');
      nativeErrorRef.current = state.error || '';
      setNativePlaybackError(state.error || '');
    };
    const listener = nativePlayer.bridge.addListener('state', update);
    // Subscribe before reading state so recreation cannot miss a track change.
    void listener.then(() => nativePlayer.bridge.state()).then(update).catch(error => {
      if (!disposed) notify(error.message || 'Could not connect to Android playback.', 'error');
    });
    const resume = () => { void nativePlayer.bridge.state().then(update).catch(() => {}); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      disposed = true;
      nativePrepareRef.current?.abort();
      void listener.then(subscription => subscription.remove()).catch(() => {});
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [nativeAndroid, notify]);

  const stopPreparing = useCallback(() => {
    nativePrepareRef.current?.abort(); nativePrepareRef.current = null; setNativePlaybackStatus('');
  }, []);

  const startNativeQueue = useCallback(async (list, selectedId, shuffleMode = shuffle, repeatMode = repeat) => {
    nativePrepareRef.current?.abort();
    const controller = new AbortController();
    nativePrepareRef.current = controller;
    let unique = [...new Map(list.map(track => [track.id, track])).values()];
    if (unique.length > 500) {
      const selected = Math.max(0, unique.findIndex(track => track.id === selectedId));
      const start = Math.max(0, Math.min(selected, unique.length - 500));
      unique = unique.slice(start, start + 500);
      notify('Playing a queue of 500 tracks around this selection. Search or choose a playlist for a smaller queue.');
    }
    for (const track of unique) nativeTracksRef.current.set(track.id, track);
    const index = Math.max(0, unique.findIndex(track => track.id === selectedId));
    // Show the chosen song at once; Android confirms it (or reports an error) when its audio is ready.
    const chosen = nativeTracksRef.current.get(unique[index].id) || unique[index];
    pendingIdRef.current = chosen.id;
    setCurrent(chosen);
    setPlaying(true);
    setProgress(0);
    setDuration(chosen.duration || 0);
    let started = false;
    try {
      setNativePlaybackStatus('Loading…');
      const result = await nativePlayer.playQueue(unique, index, {
        signal: controller.signal, options: { repeat: repeatMode, shuffle: shuffleMode, volume, muted },
        // The rest of the queue is prepared quietly once the chosen song is playing.
        onProgress: () => { if (!started) { started = true; setNativePlaybackStatus(nativeStateRef.current?.buffering ? 'Loading…' : ''); } }
      });
      if (result.skipped.length) notify(`${result.skipped.length} queue ${result.skipped.length === 1 ? 'track was' : 'tracks were'} unavailable. ${result.skipped[0].message}`, 'error');
    } catch (error) {
      if (!controller.signal.aborted) {
        if (pendingIdRef.current === chosen.id) pendingIdRef.current = null;
        void nativePlayer.bridge.state().then(state => { if (!state?.currentId) { setCurrent(null); setPlaying(false); } }).catch(() => {});
        notify(error.message || 'Could not start this track. Please retry.', 'error');
      }
    } finally {
      if (nativePrepareRef.current === controller) {
        nativePrepareRef.current = null;
        pendingIdRef.current = null;
        setNativePlaybackStatus(nativeStateRef.current?.buffering ? 'Loading…' : '');
      }
    }
  }, [shuffle, repeat, volume, muted, notify]);

  const togglePlayback = useCallback(() => {
    if (nativeAndroid) {
      void playerCommand(playing ? 'pause' : 'play');
    } else setPlaying(value => !value);
  }, [nativeAndroid, playing, playerCommand]);

  const playNext = useCallback(() => {
    if (nativeAndroid) { void playerCommand('next'); return; }
    if (!queue.length || !current) return;
    const restartCurrent = () => {
      setProgress(0);
      if (isOnlineOnly(current) && youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(0, true);
        youtubePlayerRef.current.playVideo();
      } else {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => setPlaying(false));
      }
    };
    if (repeat === 'one') {
      restartCurrent();
      return;
    }
    const currentIndex = queue.findIndex((track) => track.id === current.id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) setCurrent(queue[nextIndex]);
    else if (repeat === 'all') {
      if (queue[0]?.id === current.id) restartCurrent();
      else setCurrent(queue[0]);
    }
    else setPlaying(false);
  }, [current, queue, repeat, nativeAndroid, playerCommand]);

  useEffect(() => {
    if (nativeAndroid) return;
    const audio = audioRef.current;
    const onTime = () => setProgress(audio.currentTime);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : current?.duration || 0);
    const onEnded = () => playNext();
    const onError = () => { setPlaying(false); notify('This track could not be played. Check the source or your connection.', 'error'); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [current, notify, playNext, nativeAndroid]);

  useEffect(() => {
    const audio = audioRef.current;
    if (nativeAndroid) { audio.pause(); audio.removeAttribute('src'); return; }
    if (!current) { audio.pause(); audio.removeAttribute('src'); audio.load(); return; }
    setProgress(0);
    setDuration(current?.duration || 0);
    if (isOnlineOnly(current)) {
      audio.pause();
      audio.removeAttribute('src');
    } else {
      youtubePlayerRef.current = null;
      const blob = current.cachedBlob || current.blob;
      const source = blob ? URL.createObjectURL(blob) : current.audio;
      if (!source) { setPlaying(false); return; }
      audio.src = source;
      audio.load();
      return () => { audio.pause(); if (blob) URL.revokeObjectURL(source); };
    }
  }, [current?.id, current?.blob, current?.cachedBlob, current?.audio, current?.source, nativeAndroid]);

  useEffect(() => {
    if (!nativeAndroid && current && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, album: current.album, artwork: current.cover ? [{ src: current.cover }] : [] });
      } catch { /* Optional platform integration must not interrupt audio. */ }
    }
  }, [current?.title, current?.artist, current?.album, current?.cover, nativeAndroid]);

  useEffect(() => {
    if (nativeAndroid) return;
    const audio = audioRef.current;
    audio.volume = volume;
    audio.muted = muted;
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.setVolume(volume * 100);
      if (muted) youtubePlayerRef.current.mute();
      else youtubePlayerRef.current.unMute();
    }
  }, [volume, muted, nativeAndroid]);

  useEffect(() => {
    if (nativeAndroid) return;
    if (!current) return;
    if (isOnlineOnly(current)) {
      if (!youtubePlayerRef.current) return;
      if (playing) youtubePlayerRef.current.playVideo();
      else youtubePlayerRef.current.pauseVideo();
      return;
    }
    const audio = audioRef.current;
    const source = audio.src;
    if (playing) audio.play().catch((error) => { if (error.name !== 'AbortError' && audio.src === source) { setPlaying(false); notify('Tap play again to start audio.', 'error'); } });
    else audio.pause();
  }, [playing, current?.id, current?.blob, current?.cachedBlob, current?.audio, notify, nativeAndroid]);

  useEffect(() => {
    if (nativeAndroid || !isOnlineOnly(current)) return undefined;
    const timer = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player?.getCurrentTime) return;
      try { setProgress(player.getCurrentTime() || 0); setDuration(player.getDuration() || current.duration || 0); } catch { /* Player is being replaced. */ }
    }, 500);
    return () => window.clearInterval(timer);
  }, [current, nativeAndroid]);

  const handleYoutubeReady = (event) => {
    youtubePlayerRef.current = event.target;
    event.target.setVolume(volume * 100);
    if (muted) event.target.mute();
    else event.target.unMute();
    setDuration(event.target.getDuration() || current?.duration || 0);
    if (playing) event.target.playVideo();
  };

  const handleYoutubeState = (event) => {
    if (event.target !== youtubePlayerRef.current) return;
    if (event.data === 1) setPlaying(true);
    else if (event.data === 2) setPlaying(false);
    else if (event.data === 0) playNext();
  };

  const playPrevious = useCallback(() => {
    if (nativeAndroid) { void playerCommand('previous'); return; }
    const elapsed = isOnlineOnly(current)
      ? youtubePlayerRef.current?.getCurrentTime?.() || 0
      : audioRef.current.currentTime;
    if (elapsed > 3) {
      if (isOnlineOnly(current)) youtubePlayerRef.current?.seekTo(0, true);
      else audioRef.current.currentTime = 0;
      return;
    }
    const index = queue.findIndex((track) => track.id === current?.id);
    if (index > 0) setCurrent(queue[index - 1]);
    else if (repeat === 'all' && queue.length) setCurrent(queue[queue.length - 1]);
  }, [current, queue, repeat, nativeAndroid, playerCommand]);

  const seekTo = useCallback((nextTime) => {
    const safeTime = Math.max(0, Math.min(Number(nextTime) || 0, duration || Number(nextTime) || 0));
    if (nativeAndroid) { void playerCommand('seek', { position: safeTime }); return; }
    if (isOnlineOnly(current)) youtubePlayerRef.current?.seekTo(safeTime, true);
    else if (audioRef.current) audioRef.current.currentTime = safeTime;
    setProgress(safeTime);
  }, [current, duration, nativeAndroid, playerCommand]);

  useEffect(() => {
    if (nativeAndroid || !('mediaSession' in navigator)) return;
    const actions = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      nexttrack: playNext,
      previoustrack: playPrevious,
      seekto: (details) => seekTo(details.seekTime),
      seekbackward: (details) => seekTo(progress - (details.seekOffset || 10)),
      seekforward: (details) => seekTo(progress + (details.seekOffset || 10))
    };
    Object.entries(actions).forEach(([action, handler]) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Browser does not support this media action. */ }
    });
  }, [playNext, playPrevious, progress, seekTo, nativeAndroid]);

  const playTrack = useCallback((track, list = tracks, replaceQueue = false) => {
    if (replaceQueue) setRepeat('all');
    if (nativeAndroid) {
      if (replaceQueue) void startNativeQueue(list.length ? list : [track], track.id, shuffle, 'all');
      else if (current?.id === track.id) togglePlayback();
      else if (list === queue && queue.some(item => item.id === track.id)) void playerCommand('select', { id: track.id });
      else void startNativeQueue(list.length ? list : [track], track.id);
      return;
    }
    if (current?.id === track.id && !replaceQueue) { setPlaying((value) => !value); return; }
    const sourceList = list.length ? list : [track];
    setQueue(shuffle ? [track, ...shuffled(sourceList.filter((item) => item.id !== track.id))] : sourceList);
    setCurrent(track);
    setPlaying(true);
  }, [current, shuffle, tracks, nativeAndroid, queue, togglePlayback, playerCommand, startNativeQueue]);

  const startPlayback = useCallback((list, shuffleMode = false, repeatMode = repeat) => {
    const available = list.filter(Boolean);
    if (!available.length) return;
    setRepeat(repeatMode);
    // Shuffle starts on a random song, not the first one in the list.
    if (nativeAndroid) { const order = shuffleMode ? shuffled(available) : available; void startNativeQueue(order, order[0].id, shuffleMode, repeatMode); return; }
    const nextQueue = shuffleMode ? shuffled(available) : available;
    setShuffle(shuffleMode);
    setQueue(nextQueue);
    setCurrent(nextQueue[0]);
    setPlaying(true);
  }, [nativeAndroid, startNativeQueue, repeat]);

  const toggleShuffle = useCallback(() => {
    if (nativeAndroid) { void playerCommand('setOptions', { shuffle: !shuffle }); return; }
    setShuffle((enabled) => {
      const next = !enabled;
      if (next && current) {
        setQueue((items) => {
          const currentIndex = items.findIndex((item) => item.id === current.id);
          if (currentIndex < 0) return [current, ...shuffled(items.filter((item) => item.id !== current.id))];
          return [...items.slice(0, currentIndex + 1), ...shuffled(items.slice(currentIndex + 1))];
        });
      }
      return next;
    });
  }, [current, nativeAndroid, shuffle, playerCommand]);

  const playTrackNext = useCallback((track) => {
    if (!current) { startPlayback([track]); return; }
    if (current.id === track.id) return;
    if (nativeAndroid) {
      stopPreparing();
      nativeTracksRef.current.set(track.id, track);
      void nativePlayer.prepare(track).then(item => playerCommand('add', { item, next: true })).then(() => notify('Playing next')).catch(error => notify(error.message, 'error'));
      return;
    }
    setQueue((items) => {
      const base = items.length ? items : [current];
      const withoutTrack = base.filter((item) => item.id !== track.id);
      const currentIndex = withoutTrack.findIndex((item) => item.id === current.id);
      const insertAt = currentIndex < 0 ? 1 : currentIndex + 1;
      return [...withoutTrack.slice(0, insertAt), track, ...withoutTrack.slice(insertAt)];
    });
    notify('Playing next');
  }, [current, notify, startPlayback, nativeAndroid, playerCommand, stopPreparing]);

  const addTrackToQueue = useCallback((track) => {
    if (!current) { startPlayback([track]); return; }
    if (nativeAndroid) {
      stopPreparing();
      nativeTracksRef.current.set(track.id, track);
      void nativePlayer.prepare(track).then(item => playerCommand('add', { item, next: false })).then(() => notify('Added to queue')).catch(error => notify(error.message, 'error'));
      return;
    }
    setQueue((items) => items.some((item) => item.id === track.id) ? items : [...(items.length ? items : [current]), track]);
    notify('Added to queue');
  }, [current, notify, startPlayback, nativeAndroid, playerCommand, stopPreparing]);

  // Drops a removed library track from playback everywhere.
  const forgetTrack = useCallback(async (track) => {
    if (nativeAndroid) {
      stopPreparing();
      await nativePlayer.bridge.remove({ id: track.id });
      await nativePlayer.removeFile(track.id);
      nativeTracksRef.current.delete(track.id);
    }
    setQueue((items) => items.filter((item) => item.id !== track.id));
    if (current?.id === track.id) { setCurrent(null); setPlaying(false); }
  }, [nativeAndroid, current, stopPreparing]);

  const cycleRepeat = () => {
    const next = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
    if (nativeAndroid) void playerCommand('setOptions', { repeat: next });
    else setRepeat(next);
  };
  const changeVolume = value => {
    if (nativeAndroid) void playerCommand('setOptions', { volume: value });
    else setVolume(value);
  };
  const toggleMute = () => {
    if (nativeAndroid) void playerCommand('setOptions', { muted: !muted });
    else setMuted(value => !value);
  };
  const selectQueueTrack = track => {
    if (nativeAndroid) void playerCommand('select', { id: track.id });
    else { setCurrent(track); setPlaying(true); }
  };
  const clearUpcomingQueue = () => {
    if (nativeAndroid) { stopPreparing(); void playerCommand('clearUpcoming'); return; }
    setQueue(current ? [current] : []);
    notify('Upcoming queue cleared');
  };
  const restart = () => {
    seekTo(0);
    if (nativeAndroid) void playerCommand('play'); else setPlaying(true);
  };
  const closeOnline = () => { setPlaying(false); setCurrent(null); };

  return {
    current, setCurrent, setPlaying, queue, playing, progress, duration, volume, muted, shuffle, repeat,
    nativePlaybackStatus, nativePlaybackError, preparing: Boolean(nativePrepareRef.current),
    playerCommand, togglePlayback, playNext, playPrevious, seekTo, playTrack, startPlayback, toggleShuffle,
    playTrackNext, addTrackToQueue, forgetTrack, cycleRepeat, changeVolume, toggleMute, selectQueueTrack,
    clearUpcomingQueue, stopPreparing, restart, closeOnline, handleYoutubeReady, handleYoutubeState
  };
}
