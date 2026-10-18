import { openDB } from 'idb';

let dbPromise;

async function getDb() {
  if (typeof indexedDB === 'undefined') throw new Error('Device storage is unavailable. Open Sonora in a browser with site storage enabled.');
  if (!dbPromise) {
    dbPromise = openDB('sonora-music', 1, {
      upgrade(db) {
        const tracks = db.createObjectStore('tracks', { keyPath: 'id' });
        tracks.createIndex('addedAt', 'addedAt');
        tracks.createIndex('favorite', 'favorite');
        db.createObjectStore('playlists', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
      blocking() { dbPromise?.then((db) => db.close()).catch(() => {}); dbPromise = null; },
      terminated() { dbPromise = null; }
    }).catch((error) => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

export async function getTracks() {
  return (await getDb()).getAll('tracks');
}

export async function putTrack(track) {
  await (await getDb()).put('tracks', track);
  return track;
}

export async function deleteTrack(id) {
  const db = await getDb();
  const tx = db.transaction(['tracks', 'playlists'], 'readwrite');
  await tx.objectStore('tracks').delete(id);
  const playlists = await tx.objectStore('playlists').getAll();
  await Promise.all(playlists.map((playlist) => {
    const trackIds = playlist.trackIds.filter((trackId) => trackId !== id);
    return trackIds.length === playlist.trackIds.length
      ? Promise.resolve()
      : tx.objectStore('playlists').put({ ...playlist, trackIds });
  }));
  await tx.done;
}

export async function getPlaylists() {
  return (await getDb()).getAll('playlists');
}

export async function putPlaylist(playlist) {
  await (await getDb()).put('playlists', playlist);
  return playlist;
}

export async function deletePlaylist(id) {
  await (await getDb()).delete('playlists', id);
}

export async function getSetting(key, fallback = '') {
  const item = await (await getDb()).get('settings', key);
  return item?.value ?? fallback;
}

export async function setSetting(key, value) {
  await (await getDb()).put('settings', { key, value });
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate().catch(() => null),
    navigator.storage.persisted?.().catch(() => false) ?? false
  ]);
  return estimate ? { ...estimate, persisted } : null;
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist().catch(() => false);
}
