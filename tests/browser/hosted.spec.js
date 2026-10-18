import { test, expect } from '@playwright/test';

test.skip(!process.env.PLAYWRIGHT_HOSTED_ANDROID, 'Only runs against the Vercel Android download screen.');

test('hosted downloads offer the tested Android installer and direct file imports', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Download audio', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'Get the Android app' })).toHaveAttribute('href', '/android');
  await expect(dialog.getByText(/YouTube currently refuses/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Convert and save to device' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Import audio files' }).click();
  await expect(page.getByRole('dialog', { name: 'Add your music' })).toBeVisible();
});

test('the hosted download choices fit a small phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Get the Android app' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
