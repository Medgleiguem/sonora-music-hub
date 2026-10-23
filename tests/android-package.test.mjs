import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

async function fixture(t, arm32Metadata = true) {
  const root = await mkdtemp(join(tmpdir(), 'android-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['scripts', 'mobile', 'public/licenses', 'android/app/build/outputs/apk/release']) {
    await mkdir(join(root, dir), { recursive: true });
  }
  for (const name of ['package-android-release.mjs', 'package-android-source.py']) {
    await copyFile(new URL(`../scripts/${name}`, import.meta.url), join(root, 'scripts', name));
  }
  await copyFile(new URL('../mobile/installer.html', import.meta.url), join(root, 'mobile/installer.html'));
  await copyFile(new URL('../mobile/download-start.html', import.meta.url), join(root, 'mobile/download-start.html'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.2.2', type: 'module' }));
  await writeFile(join(root, 'public/licenses.html'), 'Licenses');
  const elements = [];
  for (const abi of ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'universal']) {
    const outputFile = `app-${abi}-release.apk`;
    if (abi !== 'armeabi-v7a' || arm32Metadata) elements.push({ type: abi === 'universal' ? 'UNIVERSAL' : 'ONE_OF_MANY',
      filters: abi === 'universal' ? [] : [{ filterType: 'ABI', value: abi }],
      versionName: '1.2.2', versionCode: 5, outputFile });
    await writeFile(join(root, 'android/app/build/outputs/apk/release', outputFile), `installer-${abi}`);
  }
  await writeFile(join(root, 'android/app/build/outputs/apk/release/output-metadata.json'),
    JSON.stringify({ variantName: 'release', elements }));
  return root;
}

test('website packages small complete ARM installers and offers both architectures', async t => {
  const root = await fixture(t);
  execFileSync(process.execPath, ['scripts/package-android-release.mjs', '--public'], { cwd: root });
  const output = join(root, 'public/downloads');
  assert.equal(await readFile(join(output, 'sonora-android.apk'), 'utf8'), 'installer-arm64-v8a');
  assert.equal(await readFile(join(output, 'sonora-android-arm64.apk'), 'utf8'), 'installer-arm64-v8a');
  assert.equal(await readFile(join(output, 'sonora-android-arm32.apk'), 'utf8'), 'installer-armeabi-v7a');
  const manifest = JSON.parse(await readFile(join(output, 'checksums.json'), 'utf8'));
  assert.equal(manifest.versionCode, 5);
  assert.equal(manifest.files['sonora-android.apk'].sha256,
    createHash('sha256').update('installer-arm64-v8a').digest('hex'));
  const page = await readFile(join(output, 'index.html'), 'utf8');
  assert.ok(!page.includes('{{'), 'installer template must be fully rendered');
  assert.match(page, /class="install" href="\.\/start-arm64\.html"/);
  assert.match(page, /class="install" href="\.\/start-arm32\.html"/);
  for (const arch of ['arm64', 'arm32']) {
    const start = await readFile(join(output, `start-${arch}.html`), 'utf8');
    assert.ok(!start.includes('{{'), 'download-start template must be fully rendered');
    assert.match(start, new RegExp(`href="\\./sonora-android-${arch}\\.apk" download`));
    assert.match(start, /noindex, nofollow/);
  }
});

test('packaging refuses a release missing 32-bit ARM metadata even if a stale APK exists', async t => {
  const root = await fixture(t, false);
  const result = spawnSync(process.execPath, ['scripts/package-android-release.mjs'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /armeabi-v7a/);
});
