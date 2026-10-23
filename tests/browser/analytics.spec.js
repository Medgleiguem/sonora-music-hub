import { test, expect } from '@playwright/test';

for (const [arch, label] of [['arm64', '64-bit'], ['arm32', '32-bit']]) {
  test(`${label} installer starts automatically even when analytics is blocked`, async ({ page }) => {
    await page.route('**/_vercel/insights/**', route => route.abort());
    await page.route(`**/sonora-android-${arch}.apk`, route => route.fulfill({
      contentType: 'application/vnd.android.package-archive',
      headers: { 'Content-Disposition': `attachment; filename="sonora-android-${arch}.apk"` },
      body: 'test installer'
    }));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/downloads/index.html');
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: `Download for ${label} Android`, exact: true }).click();
    expect((await download).suggestedFilename()).toBe(`sonora-android-${arch}.apk`);
    await expect(page).toHaveURL(new RegExp(`/downloads/start-${arch}\\.html$`));
    await expect(page.getByRole('heading', { name: 'Starting your download…' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('download-start page retains a working manual link without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.route('**/sonora-android-arm64.apk', route => route.fulfill({
      contentType: 'application/vnd.android.package-archive',
      headers: { 'Content-Disposition': 'attachment; filename="sonora-android-arm64.apk"' },
      body: 'test installer'
    }));
    await page.goto('/downloads/start-arm64.html');
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download for 64-bit Android', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('sonora-android-arm64.apk');
  } finally {
    await context.close();
  }
});

test('an early manual download cancels the pending automatic download', async ({ page }) => {
  await page.route('**/_vercel/insights/**', route => route.abort());
  await page.route('**/sonora-android-arm64.apk', route => route.fulfill({
    contentType: 'application/vnd.android.package-archive',
    headers: { 'Content-Disposition': 'attachment; filename="sonora-android-arm64.apk"' },
    body: 'test installer'
  }));
  await page.goto('/downloads/start-arm64.html', { waitUntil: 'domcontentloaded' });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download for 64-bit Android', exact: true }).click();
  await download;
  const duplicate = await page.waitForEvent('download', { timeout: 1500 }).then(() => true, () => false);
  expect(duplicate).toBe(false);
});
