'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { canonicalPlaylistUrl, collectionSource, addOnlinePage, onlineTrack, playlistPages } from './playlist-import.mjs';
import { isOnlineOnly } from './youtube-links.mjs';
import { youtubeRequest } from './native-media.mjs';
import { readDuration, readTags, pictureDataUrl } from './audio-metadata.mjs';
import { audioMimeType, plural } from './ui/format';
import {
  deletePlaylist as removePlaylist, deleteTrack as removeTrack, getPlaylists, getStorageEstimate, getTracks,
  putPlaylist, putTrack, requestPersistentStorage
} from './db';

export const searchCollectionUrl = (query) => `ytsearch:${query}`;

/** The on-device library: songs (downloaded, imported, or saved online), playlists, and storage. */
export function useLibrary({ notify, playerRef }) {
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [storage, setStorage] = useState(null);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [onlineSave, setOnlineSave] = useState(null);
  const importingRef = useRef(false);
  const onlineSaveRef = useRef(null);

  const refreshStorage = useCallback(async () => setStorage(await getStorageEstimate()), []);

  const attempt = (action) => async (...args) => {
    try { return await action(...args); }
    catch (error) { notify(error.name === 'QuotaExceededError' ? 'Device storage is full. Free some space and try again.' : error.message || 'Could not save that change. Please retry.', 'error'); }
  };

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const [storedTracks, storedPlaylists] = await Promise.all([getTracks(), getPlaylists()]);
      setTracks(storedTracks.sort((a, b) => b.addedAt - a.addedAt));
      setPlaylists(storedPlaylists.sort((a, b) => a.createdAt - b.createdAt));
    } catch { setLibraryError('Your device library could not be opened. Check that site storage is enabled, then retry.'); }
    finally { setLibraryLoading(false); }
  }, []);

  useEffect(() => { loadLibrary(); refreshStorage(); }, [loadLibrary, refreshStorage]);

  const protectDeviceStorage = useCallback(async () => {
    const persisted = await requestPersistentStorage();
    if (persisted) await refreshStorage();
    return persisted;
  }, [refreshStorage]);

  const updateTrack = useCallback(async (updated) => {
    await putTrack(updated);
    setTracks((items) => items.map((item) => item.id === updated.id ? updated : item));
    playerRef.current?.setCurrent((item) => item?.id === updated.id ? updated : item);
  }, [playerRef]);

  const savePlaylist = async (playlist) => {
    await putPlaylist(playlist);
    setPlaylists((items) => items.some((item) => item.id === playlist.id) ? items.map((item) => item.id === playlist.id ? playlist : item) : [...items, playlist]);
    return playlist;
  };

  const importFiles = async (files, options = {}) => {
    if (importingRef.current) return [];
    files = [...files].filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|opus|webm|flac)$/i.test(file.name));
    if (!files.length) { notify('No audio files found. Choose MP3, M4A, WAV, OGG, Opus, or FLAC files.', 'error'); return []; }
    importingRef.current = true;
    setImporting(true);
    let imported = 0;
    const importedTracks = [];
    const folderCollections = new Map();
    const importedAt = Date.now();
    let failed = 0;
    try {
      await protectDeviceStorage();
      for (const [index, file] of files.entries()) {
        setImportProgress({ current: index + 1, total: files.length, name: file.name });
        try {
          const [tags, fileDuration] = await Promise.all([readTags(file), readDuration(file)]);
          const cover = await pictureDataUrl(tags.picture);
          const cleanName = file.name.replace(/\.[^.]+$/, '');
          const parts = cleanName.split(' - ');
          const relativePath = file.webkitRelativePath || '';
          const relativeParts = relativePath ? relativePath.split('/').filter(Boolean) : [];
          const folderName = options.folderImport && relativeParts.length ? relativeParts[0] : '';
          const track = {
            id: `local-${crypto.randomUUID()}`,
            title: tags.title || (parts.length > 1 ? parts.slice(1).join(' - ') : cleanName),
            artist: tags.artist || (parts.length > 1 ? parts[0] : 'Unknown artist'),
            album: tags.album || (folderName || 'Local files'),
            duration: fileDuration || 0,
            cover: cover || '',
            blob: file,
            fileName: file.name,
            fileType: file.type,
            source: folderName ? 'folder' : 'local',
            folderName,
            folderPath: relativePath,
            externalId: '',
            shareUrl: '',
            originalSource: '',
            favorite: false,
            addedAt: importedAt + imported,
            lastPlayed: 0
          };
          await putTrack(track);
          setTracks((items) => [track, ...items]);
          importedTracks.push(track);
          if (folderName) {
            if (!folderCollections.has(folderName)) folderCollections.set(folderName, []);
            folderCollections.get(folderName).push(track.id);
          }
          imported += 1;
        } catch (error) {
          failed++;
          if (error.name === 'QuotaExceededError') { notify('Device storage is full. Completed imports are kept.', 'error'); break; }
        }
      }

      for (const [folderName, trackIds] of folderCollections.entries()) {
        const existing = playlists.find((playlist) => playlist.name === folderName);
        const mergedTrackIds = [...new Set([...(existing?.trackIds || []), ...trackIds])];
        await savePlaylist(existing
          ? { ...existing, trackIds: mergedTrackIds, updatedAt: Date.now() }
          : { id: crypto.randomUUID(), name: folderName, trackIds: mergedTrackIds, createdAt: Date.now() });
      }

      await refreshStorage();
      notify(folderCollections.size
        ? `${plural(imported, 'track')} added and ${folderCollections.size} folder ${folderCollections.size === 1 ? 'playlist was' : 'playlists were'} created`
        : `${plural(imported, 'track')} added to your library${failed ? `; ${failed} failed` : ''}`, failed ? 'error' : 'success');
      return importedTracks;
    } catch (error) { notify(`Import stopped. ${imported} saved tracks are kept. ${error.message || 'Try again.'}`, 'error'); return importedTracks; }
    finally { importingRef.current = false; setImporting(false); setImportProgress(null); }
  };

  const toggleFavorite = attempt(async (track) => {
    const stored = tracks.find((item) => item.id === track.id);
    if (!stored) {
      const added = { ...track, favorite: true, addedAt: Date.now() };
      await putTrack(added); setTracks((items) => [added, ...items]);
      playerRef.current?.setCurrent((item) => item?.id === added.id ? added : item);
      notify('Added to Liked songs'); return;
    }
    // An online song that was only kept because it was liked leaves the library when unliked.
    if (stored.favorite && isOnlineOnly(stored) && playerRef.current?.current?.id !== stored.id && !playlists.some((playlist) => playlist.trackIds.includes(stored.id))) {
      await removeTrack(stored.id);
      setTracks((items) => items.filter((item) => item.id !== stored.id));
      notify('Removed from Liked songs');
      return;
    }
    await updateTrack({ ...stored, favorite: !stored.favorite });
    notify(stored.favorite ? 'Removed from Liked songs' : 'Added to Liked songs');
  });

  const deleteTrack = attempt(async (track) => {
    if (!window.confirm(`Remove “${track.title}” from your library?`)) return;
    await playerRef.current?.forgetTrack(track);
    await removeTrack(track.id);
    setTracks((items) => items.filter((item) => item.id !== track.id));
    setPlaylists((items) => items.map((playlist) => ({ ...playlist, trackIds: playlist.trackIds.filter((id) => id !== track.id) })));
    refreshStorage();
    notify('Track removed');
  });

  const storeYoutubeDownload = async (blob, fileName, metadata = {}) => {
    const track = {
      id: `local-${crypto.randomUUID()}`,
      title: metadata.title || fileName.replace(/\.[^.]+$/, '') || 'YouTube audio',
      artist: metadata.artist || 'YouTube',
      album: metadata.album || 'YouTube downloads',
      duration: metadata.duration || await readDuration(new File([blob], fileName, { type: blob.type || audioMimeType(fileName) })),
      cover: metadata.cover || '',
      blob,
      fileName,
      fileType: blob.type || audioMimeType(fileName),
      source: 'youtube-download',
      folderName: '',
      folderPath: '',
      externalId: metadata.externalId || '',
      shareUrl: metadata.shareUrl || '',
      originalSource: 'youtube',
      favorite: false,
      addedAt: Date.now(),
      lastPlayed: 0
    };
    await putTrack(track);
    setTracks((items) => [track, ...items]);
    return track;
  };

  const savedCollection = (collection) => {
    if (collection.kind === 'search') return playlists.find((item) => item.sourceUrl === searchCollectionUrl(collection.query)) || null;
    try {
      const url = collectionSource(collection);
      return playlists.find((item) => { try { return item.sourceUrl && canonicalPlaylistUrl(item.sourceUrl) === url; } catch { return false; } }) || null;
    } catch { return null; }
  };

  // Saves a YouTube playlist or artist as online songs: only catalog details are stored, no audio is downloaded.
  const saveOnlineCollection = async (collection) => {
    if (onlineSaveRef.current) { notify('Another playlist is still being added. Wait a moment and retry.', 'error'); return; }
    let url;
    try { url = collectionSource(collection); } catch (error) { notify(error.message, 'error'); return; }
    const controller = new AbortController();
    onlineSaveRef.current = controller;
    setOnlineSave({ url, saved: 0 });
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const byVideo = new Map(tracks.filter((track) => track.source === 'youtube-download' && track.externalId).map((track) => [track.externalId, track]));
    const importRunId = crypto.randomUUID();
    let saved = savedCollection(collection);
    const existed = Boolean(saved);
    try {
      for await (const page of playlistPages(url, { request: youtubeRequest, signal: controller.signal })) {
        const base = saved || { id: crypto.randomUUID(), name: (collection.title || page.title || 'YouTube playlist').slice(0, 48), sourceUrl: url, trackIds: [], createdAt: Date.now() };
        const { playlist: updated, added } = addOnlinePage(base, page.entries, { byId, byVideo, importRunId, addedAt: Date.now() });
        if (!updated.trackIds.length) continue;
        await Promise.all(added.map((track) => putTrack(track)));
        if (added.length) setTracks((items) => [...added, ...items]);
        saved = await savePlaylist({ ...updated, updatedAt: Date.now() });
        setOnlineSave({ url, saved: updated.trackIds.length });
      }
      if (!saved) throw new Error('This playlist has no available songs.');
      notify(`${existed ? 'Updated' : 'Saved'} “${saved.name}” · ${plural(saved.trackIds.length, 'song')} ready to play online`);
      return saved;
    } catch (error) {
      notify(saved ? `${plural(saved.trackIds.length, 'song')} were added before an error: ${error.message} Retry to continue.` : error.message || 'Could not add this playlist.', 'error');
    } finally {
      onlineSaveRef.current = null;
      setOnlineSave(null);
    }
  };

  // Saves the songs of a search-based collection (Arabic classics, moods) as a playlist of online songs.
  const saveSearchCollection = attempt(async (collection, list) => {
    if (!list.length) { notify('Nothing to save yet. Wait for the songs to load.', 'error'); return null; }
    const timestamp = Date.now();
    const known = new Set(tracks.map((track) => track.id));
    const added = list.filter((track) => !known.has(track.id)).map((track, index) => onlineTrack(track, timestamp + index));
    await Promise.all(added.map((track) => putTrack(track)));
    if (added.length) setTracks((items) => [...added, ...items]);
    const existing = savedCollection(collection);
    const trackIds = [...new Set([...(existing?.trackIds || []), ...list.map((track) => track.id)])];
    const playlist = await savePlaylist(existing ? { ...existing, trackIds, updatedAt: timestamp }
      : { id: crypto.randomUUID(), name: collection.title.slice(0, 48), sourceUrl: searchCollectionUrl(collection.query), trackIds, createdAt: timestamp });
    notify(`Saved “${playlist.name}” · ${plural(trackIds.length, 'song')}`);
    return playlist;
  });

  const createPlaylist = attempt(async (name, trackToAdd = null) => {
    if (trackToAdd && !tracks.some((item) => item.id === trackToAdd.id)) {
      const savedTrack = { ...trackToAdd, addedAt: Date.now(), favorite: false };
      await putTrack(savedTrack);
      setTracks((items) => [savedTrack, ...items]);
    }
    const playlist = await savePlaylist({ id: crypto.randomUUID(), name, trackIds: trackToAdd ? [trackToAdd.id] : [], createdAt: Date.now() });
    notify(trackToAdd ? `Added to ${name}` : 'Playlist created');
    return playlist;
  });

  const addToPlaylist = attempt(async (playlist, track) => {
    if (playlist.trackIds.includes(track.id)) { notify('This track is already in the playlist', 'error'); return; }
    let savedTrack = tracks.find((item) => item.id === track.id);
    if (!savedTrack) { savedTrack = { ...track, addedAt: Date.now(), favorite: false }; await putTrack(savedTrack); setTracks((items) => [savedTrack, ...items]); }
    await savePlaylist({ ...playlist, trackIds: [...playlist.trackIds, track.id], updatedAt: Date.now() });
    notify(`Added to ${playlist.name}`);
  });

  const removeFromPlaylist = attempt(async (playlist, track) => {
    await savePlaylist({ ...playlist, trackIds: playlist.trackIds.filter((id) => id !== track.id) });
    notify(`Removed from ${playlist.name}`);
  });

  const movePlaylistTrack = attempt(async (playlist, track, direction) => {
    const from = playlist.trackIds.indexOf(track.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= playlist.trackIds.length) return;
    const trackIds = [...playlist.trackIds];
    [trackIds[from], trackIds[to]] = [trackIds[to], trackIds[from]];
    return savePlaylist({ ...playlist, trackIds });
  });

  const renamePlaylist = attempt(async (playlist, name) => {
    await savePlaylist({ ...playlist, name, updatedAt: Date.now() });
    notify('Playlist renamed');
  });

  const deletePlaylist = attempt(async (playlist) => {
    if (!window.confirm(`Delete the playlist “${playlist.name}”? Your music will stay in the library.`)) return false;
    await removePlaylist(playlist.id);
    setPlaylists((items) => items.filter((item) => item.id !== playlist.id));
    notify('Playlist deleted');
    return true;
  });

  return {
    tracks, setTracks, playlists, setPlaylists, storage, libraryLoading, libraryError, importing, importProgress, onlineSave,
    loadLibrary, refreshStorage, protectDeviceStorage, updateTrack, importFiles, toggleFavorite, deleteTrack, storeYoutubeDownload,
    savedCollection, saveOnlineCollection, saveSearchCollection, createPlaylist, addToPlaylist, removeFromPlaylist, movePlaylistTrack,
    renamePlaylist, deletePlaylist
  };
}
