import { test, expect } from '@playwright/test';
import { chooseDownload, goToTab, openAllSongs, quietCatalog, seedTracks } from './ui.js';

test.use({ viewport: { width: 412, height: 820 } });
test.beforeEach(async ({ page }) => { await quietCatalog(page); });

test('large libraries render in pages while filtering still finds every track', async ({ page }) => {
  await page.goto('/app');
  await seedTracks(page, Array.from({ length: 600 }, (_, index) => ({
    id: `large-${index}`, title: `Library song ${index}`, artist: 'Library artist', album: 'Collection', duration: 120, addedAt: index, source: 'local'
  })));
  await openAllSongs(page);
  await expect(page.locator('.track-row')).toHaveCount(100);
  await page.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(page.locator('.track-row')).toHaveCount(200);
  await page.getByRole('textbox', { name: 'Find in this list' }).fill('Library song 599');
  await expect(page.locator('.track-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Play Library song 599', exact: true })).toBeVisible();
});

test('the tab bar is the only navigation and marks the current tab', async ({ page }) => {
  await page.goto('/app');
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await expect(tabs.getByRole('button')).toHaveText(['Home', 'Search', 'Library']);
  await expect(tabs.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
  await goToTab(page, 'Library');
  await expect(tabs.getByRole('button', { name: 'Library', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeInViewport();
  for (const button of await tabs.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(48);
  }
});

test('the first download asks for consent in a sheet that keeps its close control visible', async ({ page }) => {
  await page.goto('/app');
  await goToTab(page, 'Search');
  await page.getByRole('textbox', { name: 'Search music' }).fill('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  await chooseDownload(page);
  const dialog = page.getByRole('dialog');
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  const closeBounds = await close.boundingBox();
  expect(closeBounds.width).toBeGreaterThanOrEqual(48);
  expect(closeBounds.height).toBeGreaterThanOrEqual(48);
  await page.setViewportSize({ width: 320, height: 480 });
  const action = process.env.PLAYWRIGHT_HOSTED_ANDROID
    ? dialog.getByRole('link', { name: 'Get the Android app', exact: true })
    : dialog.getByRole('button', { name: 'Download', exact: true });
  await action.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
  await close.click();
  await expect(dialog).toBeHidden();
});
