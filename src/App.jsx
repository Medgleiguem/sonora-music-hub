'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'jsmediatags/dist/jsmediatags.min.js';
import YouTube from 'react-youtube';
import appPackage from '../package.json';
import { collectionSource } from './playlist-import.mjs';
import { youtubeMixSeed } from '../lib/youtube-input.mjs';
import { describeSpotifyInput } from './spotify-import.mjs';
import { getYoutubeVideoId, isYoutubeUrl, isYoutubePlaylistUrl, isOnlineOnly } from './youtube-links.mjs';
import { fullscreenAndroid, isNativeAndroid, minimizeAndroid, setFullscreenAndroid, youtubeRequest } from './native-media.mjs';
import { useDownloads } from './useDownloads';
import { useLibrary } from './useLibrary';
import { usePlayer } from './usePlayer';
import { DownloadsPanel, DownloadsBanner } from './DownloadsPanel';
import Home, { DownloadsButton } from './ui/Home';
import Search from './ui/Search';
import Library from './ui/Library';
import Detail from './ui/Detail';
import { MiniPlayer, NowPlaying, QueueSheet } from './ui/Player';
import { AddToPlaylistSheet, ConsentSheet, CreateSheet, GetAppSheet, PlaylistNameSheet, SettingsSheet, TrackActionsSheet, UploadSheet } from './ui/Sheets';
import { formatLength, isDownloaded, plural, readPreference, readStored, trackSummary, writePreference, writeStored } from './ui/format';
import { AlertCircle, ArrowDownCircle, Check, Heart, Home as HomeIcon, Library as LibraryIcon, ListMusic, LoaderCircle, Music2, Search as SearchIcon, UserRound, X } from 'lucide-react';

const YOUTUBE_ENABLED = process.env.NEXT_PUBLIC_YOUTUBE_ENABLED !== 'false';
const YOUTUBE_REGION = process.env.NEXT_PUBLIC_YOUTUBE_REGION?.trim().toUpperCase() || '';
const noop = () => {};

async function youtubeSearch(params, signal) {
  const region = YOUTUBE_REGION || navigator.language?.split('-')[1]?.toUpperCase() || 'US';
  const response = await youtubeRequest(`/api/youtube/search?${new URLSearchParams({ region, ...params })}`, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(55_000)]) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'YouTube search failed');
  return data.results || [];
}

// What a pasted search turns into: a playable video, a playlist to open, or Spotify songs to download.
function detectLink(value) {
  const text = value.trim();
  if (!text) return null;
  const spotify = describeSpotifyInput(text);
  if (spotify) return spotify.kind === 'error' ? { kind: 'error', error: spotify.error } : { kind: 'spotify', spotify };
  if (isYoutubePlaylistUrl(text)) return { kind: 'yt-playlist', url: text, mix: Boolean(youtubeMixSeed(text)) };
  if (isYoutubeUrl(text)) {
    const videoId = getYoutubeVideoId(text);
    return /^[\w-]{11}$/.test(videoId) ? { kind: 'yt-video', videoId } : { kind: 'error', error: 'This YouTube link has no video or playlist.' };
  }
  return /^https?:\/\/\S+$/i.test(text) ? { kind: 'unsupported' } : null;
}

const videoTrack = (videoId) => ({ id: `youtube-${videoId}`, externalId: videoId, title: 'YouTube video', artist: 'YouTube', album: 'YouTube', duration: 0,
  cover: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, shareUrl: `https://www.youtube.com/watch?v=${videoId}`, source: 'youtube' });

function App({ hosted = false } = {}) {
  const nativeAndroid = isNativeAndroid();
  const toastTimerRef = useRef(null);
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, type = 'success', action = null) => {
    setToast({ message, type, action });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), type === 'error' ? 7000 : action ? 4500 : 3000);
  }, []);

  const playerRef = useRef(null);
  const library = useLibrary({ notify, playerRef });
  const { tracks, playlists } = library;

  const [tab, setTab] = useState('home');
  const [stack, setStack] = useState([]);
  const page = stack.at(-1) || null;
  const searchInputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('video');
  const [results, setResults] = useState({ items: [], type: 'video', loading: false, error: '' });
  const [trending, setTrending] = useState({ items: [], loading: false });
  const trendingRequested = useRef(false);
  const [linkTrack, setLinkTrack] = useState(null);
  const [spotifyName, setSpotifyName] = useState('');
  const [recentSearches, setRecentSearches] = useState([]);
  const [recent, setRecent] = useState([]);
  const [online, setOnline] = useState(true);
  const [modal, setModal] = useState(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [prefs, setPrefs] = useState({ format: 'm4a', keepBackup: true, consent: false });
  const chromeRef = useRef(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(true);
  useEffect(() => { if (nativeAndroid) void fullscreenAndroid().then(setFullscreen); }, [nativeAndroid]);

  // The phone keyboard shrinks the screen; the player and tabs step aside only while it is actually open.
  useEffect(() => {
    let tallest = 0;
    let width = window.innerWidth;
    const check = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      if (window.innerWidth !== width) { width = window.innerWidth; tallest = 0; }
      tallest = Math.max(tallest, height);
      const editing = document.activeElement?.matches?.('input:not([type=checkbox]):not([type=range]), textarea');
      setKeyboardOpen(Boolean(editing) && height < tallest * 0.8);
    };
    const later = () => window.setTimeout(check, 60);
    check();
    window.visualViewport?.addEventListener('resize', check);
    window.addEventListener('resize', check);
    document.addEventListener('focusin', later);
    document.addEventListener('focusout', later);
    return () => {
      window.visualViewport?.removeEventListener('resize', check);
      window.removeEventListener('resize', check);
      document.removeEventListener('focusin', later);
      document.removeEventListener('focusout', later);
    };
  }, []);

  // Floating layers (toasts, the YouTube player) sit just above the player and tab bar.
  useEffect(() => {
    const chrome = chromeRef.current;
    if (!chrome || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--chrome-h', `${chrome.offsetHeight}px`));
    observer.observe(chrome);
    return () => observer.disconnect();
  }, []);

  const collectionTracks = useMemo(() => stack.flatMap((entry) => entry.data?.tracks || []), [stack]);
  const knownTracks = useMemo(() => [...results.items.filter((item) => !item.kind), ...trending.items, ...collectionTracks, ...(linkTrack ? [linkTrack] : []), ...recent],
    [results.items, trending.items, collectionTracks, linkTrack, recent]);
  const player = usePlayer({ nativeAndroid, tracks, knownTracks, notify });
  playerRef.current = player;
  const { current, playing, queue } = player;

  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const likedIds = useMemo(() => new Set(tracks.filter((track) => track.favorite).map((track) => track.id)), [tracks]);
  const likedTracks = useMemo(() => tracks.filter((track) => track.favorite), [tracks]);
  const downloadedTracks = useMemo(() => tracks.filter(isDownloaded), [tracks]);
  const link = useMemo(() => detectLink(query), [query]);

  // Device preferences and recents are read after mount so the server render matches.
  useEffect(() => {
    const format = readPreference('sonora:downloadFormat', 'm4a');
    setPrefs({ format: ['m4a', 'opus', 'mp3'].includes(format) ? format : 'm4a', keepBackup: readPreference('sonora:downloadBackup', 'yes') === 'yes', consent: readPreference('sonora:downloadConsent', '') === 'yes' });
    setRecentSearches(readStored('sonora:recentSearches', []));
    setRecent(readStored('sonora:recent', []));
  }, []);

  useEffect(() => {
    if (!current) { setNowPlayingOpen(false); setQueueOpen(false); return; }
    setRecent((list) => {
      if (list[0]?.id === current.id) return list;
      const next = [trackSummary(current), ...list.filter((item) => item.id !== current.id)].slice(0, 20);
      writeStored('sonora:recent', next);
      return next;
    });
  }, [current?.id]);

  // Navigation: three tabs, each with a stack of detail pages.
  const openPage = useCallback((next) => setStack((items) => [...items, { ...next, key: crypto.randomUUID() }]), []);
  const goBack = useCallback(() => setStack((items) => items.slice(0, -1)), []);
  const focusSearch = () => window.setTimeout(() => searchInputRef.current?.focus(), 60);
  const switchTab = useCallback((next) => {
    setStack([]);
    setTab(next);
    if (next === 'search') focusSearch();
  }, []);

  useEffect(() => {
    const connectivity = () => setOnline(navigator.onLine);
    const shortcuts = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); switchTab('search'); } };
    connectivity();
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    window.addEventListener('keydown', shortcuts);
    return () => { window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity); window.removeEventListener('keydown', shortcuts); window.clearTimeout(toastTimerRef.current); };
  }, [switchTab]);

  // Search runs as you type; a pasted link becomes a link card instead.
  const searchAbortRef = useRef(null);
  const runSearch = useCallback(async (term, type) => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setResults((previous) => ({ items: previous.type === type ? previous.items : [], type, loading: true, error: '' }));
    try {
      const items = await youtubeSearch({ q: term, type }, controller.signal);
      if (!controller.signal.aborted) setResults({ items, type, loading: false, error: '' });
    } catch (error) {
      if (!controller.signal.aborted) setResults({ items: [], type, loading: false, error: error.name === 'TimeoutError' ? 'Search took too long. Please retry.' : error.message || 'Could not connect to YouTube. Please try again.' });
    }
  }, []);
  useEffect(() => {
    const term = query.trim();
    searchAbortRef.current?.abort();
    if (!term || link || !online || !YOUTUBE_ENABLED) { setResults({ items: [], type: searchType, loading: false, error: '' }); return undefined; }
    setResults((previous) => ({ ...previous, loading: true }));
    const timer = window.setTimeout(() => runSearch(term, searchType), 400);
    return () => window.clearTimeout(timer);
  }, [query, searchType, link, online, runSearch]);
  useEffect(() => () => searchAbortRef.current?.abort(), []);

  useEffect(() => {
    setLinkTrack(null);
    if (link?.kind !== 'yt-video') return undefined;
    const controller = new AbortController();
    youtubeSearch({ q: link.videoId, type: 'video' }, controller.signal)
      .then((items) => { if (!controller.signal.aborted) setLinkTrack(items.find((item) => item.externalId === link.videoId) || videoTrack(link.videoId)); })
      .catch(() => { if (!controller.signal.aborted) setLinkTrack(videoTrack(link.videoId)); });
    return () => controller.abort();
  }, [link?.kind, link?.videoId]);

  useEffect(() => {
    if (tab !== 'home' || !online || !YOUTUBE_ENABLED || trendingRequested.current) return;
    trendingRequested.current = true;
    setTrending({ items: [], loading: true });
    youtubeSearch({ type: 'video' }, new AbortController().signal)
      .then((items) => setTrending({ items: items.slice(0, 16), loading: false }))
      .catch(() => { trendingRequested.current = false; setTrending({ items: [], loading: false }); });
  }, [tab, online]);

  const commitSearch = (term = query.trim()) => {
    if (!term || detectLink(term)) return;
    setRecentSearches((list) => {
      const next = [term, ...list.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 8);
      writeStored('sonora:recentSearches', next);
      return next;
    });
  };
  const removeRecentSearch = (term) => setRecentSearches((list) => { const next = list.filter((item) => item !== term); writeStored('sonora:recentSearches', next); return next; });

  // YouTube collections (playlists, artists, curated searches) load into their page entry.
  const collectionAbortRef = useRef(null);
  const loadCollection = useCallback(async (entry, start = 1) => {
    collectionAbortRef.current?.abort();
    const controller = new AbortController();
    collectionAbortRef.current = controller;
    const { collection } = entry;
    const patch = (values) => setStack((items) => items.map((item) => item.key === entry.key ? { ...item, data: typeof values === 'function' ? values(item.data) : { ...item.data, ...values } } : item));
    const failure = collection.kind === 'artist' ? 'Could not load this artist.' : 'Could not load these songs.';
    patch({ loading: true, error: '' });
    try {
      if (collection.kind === 'search') {
        const items = await youtubeSearch({ q: collection.query, type: 'video' }, controller.signal);
        // Curated collections are songs, not hour-long compilations.
        patch({ tracks: items.filter((track) => !track.duration || track.duration <= 15 * 60), nextStart: null, loading: false });
        return;
      }
      const params = new URLSearchParams({ url: collectionSource(collection), start: String(start) });
      const response = await youtubeRequest(`/api/youtube/playlist?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || failure);
      controller.signal.throwIfAborted();
      patch((previous = {}) => ({
        ...previous, loading: false, title: previous.title || data.title, nextStart: data.nextStart || null,
        tracks: [...new Map([...(start === 1 ? [] : previous.tracks || []), ...(data.entries || [])].map((track) => [track.id, track])).values()]
      }));
    } catch (error) {
      if (controller.signal.aborted) patch((previous) => previous?.tracks ? { ...previous, loading: false } : null);
      else patch({ loading: false, error: error.message || failure });
    } finally { if (collectionAbortRef.current === controller) collectionAbortRef.current = null; }
  }, []);
  useEffect(() => {
    if (page?.type === 'collection' && !page.data) void loadCollection(page);
  }, [page, loadCollection]);

  // Downloads: one tap starts them; consent is asked once per device.
  const downloads = useDownloads({
    tracks, playlists, setTracks: library.setTracks, setPlaylists: library.setPlaylists, setSelectedPlaylist: noop, notify,
    refreshStorage: library.refreshStorage, protectDeviceStorage: library.protectDeviceStorage, storeYoutubeDownload: library.storeYoutubeDownload,
    updateTrack: library.updateTrack, libraryReady: !library.libraryLoading && !library.libraryError, onSingleSaved: noop
  });
  const startDownload = (request, title) => {
    const known = new Set(downloads.jobs.map((job) => job.id));
    const id = downloads.start({ format: prefs.format, keepBackup: prefs.keepBackup, addAfterDownload: false, ...request });
    if (!known.has(id)) notify(`Downloading ${title}`, 'success', { label: 'View', run: () => setModal({ type: 'downloads' }) });
  };
  const requestDownload = (request, title) => {
    if (hosted && !nativeAndroid) { setModal({ type: 'get-app' }); return; }
    if (!prefs.consent) { setModal({ type: 'consent', request, title }); return; }
    startDownload(request, title);
  };
  // Online imports only match songs and store their details: no consent or download needed.
  const startOnlineImport = (request, title) => {
    const known = new Set(downloads.jobs.map((job) => job.id));
    const id = downloads.start({ format: prefs.format, online: true, ...request });
    if (!known.has(id)) notify(`Adding ${title} to your library`, 'success', { label: 'View', run: () => setModal({ type: 'downloads' }) });
  };
  const downloadTrack = (track) => {
    const stored = byId.get(track.id);
    // A saved online song is downloaded in place so likes and playlists keep pointing at it.
    if (stored && isOnlineOnly(stored)) requestDownload({ tracks: [stored], title: stored.title }, `“${stored.title}”`);
    else requestDownload({ url: track.shareUrl, track }, `“${track.title}”`);
  };
  const downloadList = (title, list, playlistId = null) => {
    const songs = list.filter(isOnlineOnly);
    if (!songs.length) { notify('Every song here is already downloaded.'); return; }
    requestDownload({ tracks: songs, title, playlistId }, `${plural(songs.length, 'song')} from “${title}”`);
  };
  const canDownload = (track) => track && !isDownloaded(track) && track.source === 'youtube' && Boolean(track.shareUrl || track.externalId);

  useEffect(() => {
    if (!nativeAndroid) return undefined;
    const back = () => {
      if (modal) setModal(null);
      else if (queueOpen) setQueueOpen(false);
      else if (nowPlayingOpen) setNowPlayingOpen(false);
      else if (stack.length) goBack();
      else if (tab !== 'home') switchTab('home');
      else if (downloads.active.length) setModal({ type: 'downloads' });
      else void minimizeAndroid();
    };
    window.addEventListener('sonora:back', back);
    return () => window.removeEventListener('sonora:back', back);
  }, [nativeAndroid, modal, queueOpen, nowPlayingOpen, stack.length, tab, goBack, switchTab, downloads.active.length]);

  // Library matches skip songs already in the YouTube results, so liking a result does not move it.
  const libraryMatches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || link) return [];
    const shown = new Set(results.items.map((item) => item.id));
    return tracks.filter((track) => !shown.has(track.id) && [track.title, track.artist, track.album].some((value) => value?.toLowerCase().includes(term))).slice(0, 30);
  }, [tracks, query, link, results.items]);
  // Opening the downloads sheet counts as seeing any problems, so the bar above the player can rest.
  useEffect(() => { if (modal?.type === 'downloads') downloads.acknowledge(); }, [modal?.type, downloads.jobs.length]);

  const openTrackMenu = (track, list, playlist = null) => setModal({ type: 'track', track, list, playlistId: playlist?.id || null });
  const playFrom = (track, list) => player.playTrack(track, list);
  const recentTracks = useMemo(() => recent.map((item) => byId.get(item.id) || item), [recent, byId]);
  const downloadsButton = <DownloadsButton count={downloads.jobs.length} active={downloads.active.length} onClick={() => setModal({ type: 'downloads' })} />;

  // Everything a detail page needs, for both library lists and YouTube collections.
  const detailProps = () => {
    if (page.type === 'collection') {
      const collection = page.collection;
      const data = page.data || {};
      const list = data.tracks || [];
      const kind = collection.kind;
      const title = collection.title || data.title || 'YouTube playlist';
      const saved = library.savedCollection(collection);
      const count = list.length ? plural(list.length, 'song') : '';
      return {
        list, collection: true, loading: Boolean(data.loading), error: data.error || '', hasMore: Boolean(data.nextStart),
        onLoadMore: () => loadCollection(page, data.nextStart), onRetry: () => loadCollection(page, list.length ? data.nextStart || 1 : 1),
        meta: {
          title, art: kind === 'search' ? list[0] : collection.cover ? collection : list[0], round: kind === 'artist', arabic: collection.arabic,
          iconComponent: kind === 'artist' ? UserRound : ListMusic, emptyIcon: Music2, emptyTitle: 'No available songs', emptyText: 'Try another search.',
          // Arabic names are isolated so they never reorder the rest of the line.
          subtitle: [kind === 'artist' ? 'Artist' : kind === 'search' ? (collection.arabic ? `\u2068${collection.arabic}\u2069` : 'Mix') : 'YouTube playlist', count].filter(Boolean).join(' · '),
          footnote: kind === 'artist' ? 'Songs from this artist’s YouTube channel. Uploads can include live performances and other videos.' : ''
        },
        saved: Boolean(saved), savingOnline: Boolean(library.onlineSave),
        onSave: () => saved ? openPage({ type: 'playlist', id: saved.id })
          : kind === 'search' ? library.saveSearchCollection(collection, list) : library.saveOnlineCollection(collection),
        onlineCount: kind === 'search' ? list.filter((track) => !isDownloaded(byId.get(track.id))).length : 0,
        onDownloadAll: kind === 'search'
          ? async () => {
            const playlist = saved || await library.saveSearchCollection(collection, list);
            // Songs-mode downloads read the library, so wait for the saved songs to reach it.
            if (playlist) window.setTimeout(() => downloadList(playlist.name, list.map((track) => byId.get(track.id) || { ...track, source: 'youtube' }), playlist.id), 80);
          }
          : () => requestDownload({ url: collection.uploadsUrl || collection.shareUrl, title }, `“${title}”`)
      };
    }
    const playlist = page.type === 'playlist' ? playlists.find((item) => item.id === page.id) : null;
    const list = page.type === 'liked' ? likedTracks : page.type === 'downloaded' ? downloadedTracks
      : page.type === 'songs' ? tracks : (playlist?.trackIds || []).map((id) => byId.get(id)).filter(Boolean);
    const onlineCount = page.type === 'downloaded' ? 0 : list.filter(isOnlineOnly).length;
    const length = list.reduce((sum, track) => sum + (track.duration || 0), 0);
    const downloaded = list.filter(isDownloaded).length;
    const subtitle = [plural(list.length, 'song'), length > 60 ? formatLength(length) : '', page.type !== 'downloaded' && downloaded ? `${downloaded} downloaded` : ''].filter(Boolean).join(' · ');
    const base = {
      liked: { title: 'Liked songs', tone: 'tone-liked', icon: <Heart size={56} fill="currentColor" />, emptyIcon: Heart, emptyTitle: 'No liked songs yet', emptyText: 'Tap the heart on any song to keep it here. No download needed.' },
      downloaded: { title: 'Downloaded', tone: 'tone-offline', icon: <ArrowDownCircle size={56} />, emptyIcon: ArrowDownCircle, emptyTitle: 'Nothing downloaded yet', emptyText: 'Download songs or playlists, or add music from this device, to listen offline.' },
      songs: { title: 'All songs', tone: 'tone-slate', icon: <Music2 size={56} />, emptyIcon: Music2, emptyTitle: 'No songs yet', emptyText: 'Like, save, or download songs and they appear here.' },
      playlist: { title: playlist?.name || 'Playlist', art: list.find((track) => track.cover) || { id: playlist?.id, title: playlist?.name }, numbered: true, emptyIcon: ListMusic, emptyTitle: 'This playlist is empty', emptyText: 'Find a song, open its menu, and choose Add to playlist.' }
    }[page.type];
    return {
      list, playlist, meta: { ...base, subtitle }, onlineCount,
      onDownloadAll: onlineCount ? () => downloadList(base.title, list, page.type === 'playlist' ? playlist.id : page.type === 'liked' ? 'favorites' : null) : undefined,
      onMenu: playlist ? () => setModal({ type: 'playlist-edit', playlistId: playlist.id }) : undefined
    };
  };

  const renderDetail = () => {
    const props = detailProps();
    if (page.type === 'playlist' && !props.playlist) return null;
    const { list } = props;
    const ids = new Set(list.map((track) => track.id));
    const isPlayingHere = Boolean(current && ids.has(current.id) && queue.length && queue.length === Math.min(nativeAndroid ? 500 : Infinity, list.length) && queue.every((track) => ids.has(track.id)));
    const repeatMode = props.collection ? 'all' : player.repeat;
    return (
      <Detail key={page.key} {...props} tracks={list} onBack={goBack} current={current} playing={playing} likedIds={likedIds} isPlayingHere={isPlayingHere} downloadsButton={downloadsButton}
        onPlayAll={(visible) => isPlayingHere ? player.togglePlayback() : player.startPlayback(visible, false, repeatMode)}
        onShuffle={(visible) => player.startPlayback(visible, true, repeatMode)}
        onPlayTrack={(track, visible) => props.collection ? player.playTrack(track, visible, !isPlayingHere) : player.playTrack(track, visible)}
        onLike={library.toggleFavorite} onMore={(track, visible) => openTrackMenu(track, visible, props.playlist)} />
    );
  };

  const screen = page ? renderDetail()
    : tab === 'home' ? <Home tracks={tracks} playlists={playlists} recent={recentTracks} trending={trending} online={online} youtubeEnabled={YOUTUBE_ENABLED} current={current} playing={playing}
        likedCount={likedTracks.length} downloadedCount={downloadedTracks.length} downloadsButton={downloadsButton} onOpen={openPage} onPlay={playFrom}
        onSearch={() => switchTab('search')} onSettings={() => { library.refreshStorage(); setModal({ type: 'settings' }); }} onAddFiles={() => setModal({ type: 'upload' })} />
    : tab === 'search' ? <Search inputRef={searchInputRef} query={query} setQuery={setQuery} type={searchType} setType={setSearchType}
        results={results.type === searchType ? results : { ...results, items: [] }} online={online} youtubeEnabled={YOUTUBE_ENABLED} link={link} linkTrack={linkTrack} savingOnline={Boolean(library.onlineSave)}
        libraryMatches={libraryMatches}
        recentSearches={recentSearches} onPickRecent={setQuery} onRemoveRecent={removeRecentSearch} onCommit={() => commitSearch()} onRetry={() => runSearch(query.trim(), searchType)}
        onOpen={openPage} onPlay={playFrom} onLike={library.toggleFavorite} onMore={(track, list) => openTrackMenu(track, list)} likedIds={likedIds} current={current} playing={playing}
        downloadsButton={downloadsButton} spotifyName={spotifyName}
        linkActions={{
          onPlayTrack: (track) => player.playTrack(track, [track]),
          onLikeTrack: (track) => likedIds.has(track.id) ? notify('Already in Liked songs') : library.toggleFavorite(track),
          onAddSpotify: (name) => startOnlineImport({ url: query.trim(), ...(name ? { name } : {}) }, name ? `“${name}”` : 'songs from Spotify'),
          onDownloadTrack: (track) => downloadTrack(track || videoTrack(link.videoId)),
          onOpenPlaylist: () => openPage({ type: 'collection', collection: { kind: 'playlist', shareUrl: query.trim(), title: '' } }),
          onSavePlaylist: async () => { const saved = await library.saveOnlineCollection({ shareUrl: query.trim() }); if (saved) openPage({ type: 'playlist', id: saved.id }); },
          onDownloadPlaylist: () => requestDownload({ url: query.trim() }, 'playlist'),
          onDownloadSpotify: (name) => requestDownload({ url: query.trim(), ...(name ? { name } : {}) }, name ? `“${name}”` : 'from Spotify')
        }} />
    : <Library tracks={tracks} playlists={playlists} likedCount={likedTracks.length} downloadedCount={downloadedTracks.length} downloadsButton={downloadsButton}
        current={current} playing={playing} likedIds={likedIds} onOpen={openPage} onCreate={() => setModal({ type: 'create' })} onPlay={playFrom}
        onLike={library.toggleFavorite} onMore={(track, list) => openTrackMenu(track, list)} />;

  const menuTrack = modal?.type === 'track' ? byId.get(modal.track.id) || modal.track : null;
  const menuPlaylist = modal?.playlistId ? playlists.find((item) => item.id === modal.playlistId) : null;
  const menuIndex = menuPlaylist && menuTrack ? menuPlaylist.trackIds.indexOf(menuTrack.id) : -1;
  const onlineVideo = !nativeAndroid && isOnlineOnly(current);
  const queueIndex = queue.findIndex((track) => track.id === current?.id);
  const overlay = Boolean(modal || nowPlayingOpen || queueOpen);
  const showStatus = nativeAndroid && Boolean(player.nativePlaybackError);

  return (
    <div className={`app ${nativeAndroid ? 'native-android' : ''} ${onlineVideo ? 'has-video' : ''} ${nowPlayingOpen ? 'np-open' : ''} ${keyboardOpen ? 'keyboard' : ''}`}>
      <main className="screen" inert={overlay}>
        {library.libraryError && <div className="app-banner error" role="alert"><AlertCircle size={17} /><span>{library.libraryError}</span><button onClick={library.loadLibrary}>Retry</button></div>}
        {library.libraryLoading && <div className="app-banner" role="status"><LoaderCircle className="spin" size={16} />Opening your library…</div>}
        {screen}
      </main>

      <div className="chrome" ref={chromeRef} inert={overlay}>
        {showStatus && (
          <div className="status-strip error" role="alert">
            <AlertCircle size={17} />
            <span>{player.nativePlaybackError}</span>
            <button onClick={() => player.playerCommand('play')}>Retry playback</button>
          </div>
        )}
        {modal?.type !== 'downloads' && <DownloadsBanner jobs={downloads.jobs} onOpen={() => setModal({ type: 'downloads' })} />}
        {current && !nowPlayingOpen && <MiniPlayer track={current} playing={playing} progress={player.progress} duration={player.duration} liked={likedIds.has(current.id)}
          status={nativeAndroid && !showStatus ? player.nativePlaybackStatus : ''} loading={nativeAndroid && player.nativePlaybackStatus === 'Loading…'} onOpen={() => setNowPlayingOpen(true)} onToggle={player.togglePlayback} onNext={player.playNext} onLike={() => library.toggleFavorite(current)} />}
        <nav className="tab-bar" aria-label="Main">
          {[['home', 'Home', HomeIcon], ['search', 'Search', SearchIcon], ['library', 'Library', LibraryIcon]].map(([id, label, Icon]) => (
            <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined}
              onClick={() => tab === id && id === 'search' && !stack.length ? searchInputRef.current?.focus() : switchTab(id)}>
              <Icon size={24} strokeWidth={tab === id ? 2.4 : 1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {onlineVideo && (
        <section className={`youtube-dock ${nowPlayingOpen ? 'expanded' : ''}`} aria-label="YouTube video player" inert={Boolean(modal || queueOpen)}>
          {!nowPlayingOpen && <div className="youtube-dock-head"><button onClick={() => setNowPlayingOpen(true)}>Playing on YouTube</button><button className="icon-button" aria-label="Close YouTube player" onClick={player.closeOnline}><X size={17} /></button></div>}
          <div className="youtube-frame">
            <YouTube key={current.externalId} videoId={current.externalId} opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: window.location.origin } }}
              onReady={player.handleYoutubeReady} onStateChange={player.handleYoutubeState} onError={() => { player.setPlaying(false); notify('YouTube could not play this video. Try another result.', 'error'); }} />
          </div>
        </section>
      )}

      {nowPlayingOpen && current && (
        <NowPlaying track={current} playing={playing} progress={player.progress} duration={player.duration} volume={player.volume} muted={player.muted} shuffle={player.shuffle} repeat={player.repeat}
          liked={likedIds.has(current.id)} upcoming={queueIndex >= 0 ? queue.slice(queueIndex + 1, queueIndex + 4) : []} videoSlot={onlineVideo} status={nativeAndroid ? player.nativePlaybackStatus : ''}
          onClose={() => setNowPlayingOpen(false)} onToggle={player.togglePlayback} onPrevious={player.playPrevious} onNext={player.playNext} onSeek={player.seekTo}
          onVolume={player.changeVolume} onMute={player.toggleMute} onShuffle={player.toggleShuffle} onRepeat={player.cycleRepeat} onLike={() => library.toggleFavorite(current)}
          onAdd={() => setModal({ type: 'add', track: current })} onMore={() => openTrackMenu(current, queue.length ? queue : [current])}
          onDownload={canDownload(byId.get(current.id) || current) ? () => downloadTrack(current) : undefined} onQueue={() => setQueueOpen(true)} onSelect={player.selectQueueTrack} />
      )}
      {queueOpen && <QueueSheet queue={queue} current={current} playing={playing} onClose={() => setQueueOpen(false)} onSelect={player.selectQueueTrack} onClearUpcoming={player.clearUpcomingQueue} />}

      {modal?.type === 'track' && menuTrack && (
        <TrackActionsSheet track={menuTrack} liked={likedIds.has(menuTrack.id)} stored={byId.get(menuTrack.id)} playlist={menuPlaylist}
          canMoveUp={menuIndex > 0} canMoveDown={menuIndex >= 0 && menuIndex < (menuPlaylist?.trackIds.length || 0) - 1} onClose={() => setModal(null)}
          onPlayNext={() => { player.playTrackNext(menuTrack); setModal(null); }} onQueue={() => { player.addTrackToQueue(menuTrack); setModal(null); }}
          onLike={() => { library.toggleFavorite(menuTrack); setModal(null); }} onAdd={() => setModal({ type: 'add', track: menuTrack })}
          onDownload={canDownload(menuTrack) ? () => { setModal(null); downloadTrack(menuTrack); } : null}
          onMove={(direction) => library.movePlaylistTrack(menuPlaylist, menuTrack, direction)}
          onRemoveFromPlaylist={() => { library.removeFromPlaylist(menuPlaylist, menuTrack); setModal(null); }}
          onDelete={() => { setModal(null); library.deleteTrack(byId.get(menuTrack.id)); }} />
      )}
      {modal?.type === 'add' && <AddToPlaylistSheet track={modal.track} playlists={playlists} onClose={() => setModal(null)}
        onAdd={async (playlist) => { setModal(null); await library.addToPlaylist(playlist, modal.track); }} onNew={() => setModal({ type: 'new-playlist', track: modal.track })} />}
      {modal?.type === 'new-playlist' && <PlaylistNameSheet onClose={() => setModal(null)} onSubmit={async (name) => { setModal(null); await library.createPlaylist(name, modal.track || null); }} />}
      {modal?.type === 'playlist-edit' && (() => {
        const playlist = playlists.find((item) => item.id === modal.playlistId);
        return playlist && <PlaylistNameSheet title="Edit playlist" initial={playlist.name} submitLabel="Rename" onClose={() => setModal(null)}
          onSubmit={(name) => { setModal(null); library.renamePlaylist(playlist, name); }}
          onDelete={async () => { setModal(null); if (await library.deletePlaylist(playlist)) goBack(); }} />;
      })()}
      {modal?.type === 'create' && <CreateSheet onClose={() => setModal(null)} onNewPlaylist={() => setModal({ type: 'new-playlist' })}
        onImportLink={() => { setModal(null); setQuery(''); switchTab('search'); notify('Paste a YouTube or Spotify playlist link'); }} onAddFiles={() => setModal({ type: 'upload' })} />}
      {modal?.type === 'upload' && <UploadSheet onClose={() => !library.importing && setModal(null)} importing={library.importing} progress={library.importProgress}
        onFiles={async (files) => { await library.importFiles(files); setModal(null); }} onFolder={async (files) => { await library.importFiles(files, { folderImport: true }); setModal(null); }} />}
      {modal?.type === 'consent' && <ConsentSheet title={modal.title} onClose={() => setModal(null)}
        onAccept={() => { writePreference('sonora:downloadConsent', 'yes'); setPrefs((value) => ({ ...value, consent: true })); setModal(null); startDownload(modal.request, modal.title); }} />}
      {modal?.type === 'get-app' && <GetAppSheet onClose={() => setModal(null)} onImport={() => setModal({ type: 'upload' })} />}
      {modal?.type === 'downloads' && <DownloadsPanel jobs={downloads.jobs} nativeAndroid={nativeAndroid} onClose={() => setModal(null)}
        onNew={() => { setModal(null); setQuery(''); switchTab('search'); }} onStop={downloads.stop} onResume={downloads.resume} onRemove={downloads.remove} onClearFinished={downloads.clearFinished}
        onOpenPlaylist={(id) => { if (playlists.some((item) => item.id === id)) { setModal(null); setStack([]); setTab('library'); openPage({ type: 'playlist', id }); } }}
        onAddRemaining={(job) => { setModal(null); setSpotifyName(job.spotifyLimited); setQuery(''); switchTab('search'); notify(`Paste the remaining Spotify songs to add them to “${job.spotifyLimited}”`); }}
        onFind={(text) => { setModal(null); switchTab('search'); setQuery(text); }} />}
      {modal?.type === 'settings' && <SettingsSheet onClose={() => setModal(null)} storage={library.storage} nativeAndroid={nativeAndroid} version={appPackage.version}
        format={prefs.format} onFormat={(format) => { writePreference('sonora:downloadFormat', format); setPrefs((value) => ({ ...value, format })); }}
        fullscreen={nativeAndroid ? fullscreen : null} onFullscreen={(enabled) => { setFullscreen(enabled); void setFullscreenAndroid(enabled).catch(() => setFullscreen(!enabled)); }}
        keepBackup={prefs.keepBackup} onKeepBackup={(keepBackup) => { writePreference('sonora:downloadBackup', keepBackup ? 'yes' : 'no'); setPrefs((value) => ({ ...value, keepBackup })); }} />}

      {toast && (
        <div className={`toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          {toast.type === 'error' ? <AlertCircle size={17} /> : <Check size={17} />}<span>{toast.message}</span>
          {toast.action && <button onClick={() => { toast.action.run(); setToast(null); }}>{toast.action.label}</button>}
        </div>
      )}
    </div>
  );
}

export default App;
