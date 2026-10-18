import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 412, height: 820 } });

test('large libraries render in pages while search still finds every track', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Opening your library…', { exact: true })).toBeHidden();
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('sonora-music');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('tracks', 'readwrite');
    for (let index = 0; index < 600; index++) transaction.objectStore('tracks').put({
      id: `large-${index}`, title: `Library song ${index}`, artist: 'Library artist',
      album: 'Collection', duration: 120, addedAt: index, source: 'local'
    });
    await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.locator('.track-row')).toHaveCount(60);
  await page.getByRole('button', { name: /Show more tracks/ }).click();
  await expect(page.locator('.track-row')).toHaveCount(120);
  await page.getByRole('textbox', { name: 'Search music' }).fill('Library song 599');
  await expect(page.locator('.track-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Play Library song 599', exact: true })).toBeVisible();
});

test('closed phone navigation is excluded from keyboard and screen reader navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Your library', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Your library', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Your library', exact: true })).toBeHidden();
});

test('phone download controls have usable touch targets and the dialog keeps its close control visible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  const closeBounds = await close.boundingBox();
  expect(closeBounds.width).toBeGreaterThanOrEqual(48);
  expect(closeBounds.height).toBeGreaterThanOrEqual(48);
  await page.setViewportSize({ width: 320, height: 480 });
  const action = process.env.PLAYWRIGHT_HOSTED_ANDROID
    ? dialog.getByRole('link', { name: 'Get the Android app', exact: true })
    : dialog.getByRole('button', { name: 'Convert and save to device', exact: true });
  await action.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
  await close.click();
  await expect(dialog).toBeHidden();
});
