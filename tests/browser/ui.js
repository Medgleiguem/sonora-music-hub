// Shared steps for driving the tab-based phone UI.
import { expect } from '@playwright/test';

// Remembers the one-time download consent and download preferences, as a returning user would have them.
export async function downloadPreferences(page, { format = 'm4a', keepBackup = false } = {}) {
  await page.addInitScript(({ format, keepBackup }) => {
    localStorage.setItem('sonora:downloadConsent', 'yes');
    localStorage.setItem('sonora:downloadFormat', format);
    localStorage.setItem('sonora:downloadBackup', keepBackup ? 'yes' : 'no');
  }, { format, keepBackup });
}

// Home loads popular songs; keep that off the network unless a test routes search itself.
export async function quietCatalog(page) {
  await page.route('**/api/youtube/search?**', route => route.fulfill({ json: { results: [] } }));
}

export async function libraryReady(page) {
  await expect(page.getByText('Opening your library…', { exact: true })).toBeHidden();
}

export async function goToTab(page, name) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true }).click();
}

export async function searchFor(page, text) {
  await goToTab(page, 'Search');
  await page.getByRole('textbox', { name: 'Search music' }).fill(text);
}

export async function openDownloads(page) {
  await page.getByRole('button', { name: /^Downloads/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Downloads' })).toBeVisible();
}

export async function closeDialog(page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

export async function openAllSongs(page) {
  await goToTab(page, 'Library');
  await page.getByRole('button', { name: /^All songs/ }).click();
}

export async function stored(page, store) {
  return page.evaluate(async name => {
    const db = await new Promise(resolve => { const r = indexedDB.open('sonora-music'); r.onsuccess = () => resolve(r.result); });
    const rows = await new Promise(resolve => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); });
    db.close(); return rows.map(({ blob, cachedBlob, ...row }) => row);
  }, store);
}

export async function seedTracks(page, rows) {
  await libraryReady(page);
  await page.evaluate(async tracks => {
    const db = await new Promise(resolve => { const r = indexedDB.open('sonora-music'); r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction('tracks', 'readwrite');
    for (const track of tracks) tx.objectStore('tracks').put(track);
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
  }, rows);
  await page.reload();
  await libraryReady(page);
}

// The two choices on a pasted link: keep it online, or download it.
export async function chooseDownload(page) {
  await page.getByRole('button', { name: /^Download Saved on this phone/ }).click();
}

export async function chooseOnline(page) {
  await page.getByRole('button', { name: /^(Add to library|Like it) / }).click();
}
