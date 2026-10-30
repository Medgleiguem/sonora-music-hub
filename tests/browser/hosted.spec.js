import { test, expect } from '@playwright/test';
import { chooseDownload, searchFor } from './ui.js';

const video = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

test.skip(!process.env.PLAYWRIGHT_HOSTED_ANDROID, 'Only runs against the Vercel Android download screen.');

test('hosted downloads offer the tested Android installer and direct file imports', async ({ page }) => {
  await page.goto('/app');
  await searchFor(page, video);
  await chooseDownload(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'Get the Android app' })).toHaveAttribute('href', '/android');
  await expect(dialog.getByText(/YouTube refuses downloads/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Import audio files instead' }).click();
  await expect(page.getByRole('dialog', { name: 'Add music from this device' })).toBeVisible();
});

test('the hosted download choices fit a small phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app');
  await searchFor(page, video);
  await chooseDownload(page);
  await expect(page.getByRole('link', { name: 'Get the Android app' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
