import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const release = join(root, 'android/app/build/outputs/apk/release');
const metadata = JSON.parse(await readFile(join(release, 'output-metadata.json'), 'utf8'));
if (metadata.variantName !== 'release' || metadata.elements.some(item => item.versionName !== version)) {
  throw new Error('Build the signed release for the current package version before packaging.');
}
const destination = join(root, 'mobile-artifacts/android-installer/.vercel/output');
const staticFiles = join(destination, 'static');
await mkdir(staticFiles, { recursive: true });
execFileSync('python3', ['scripts/package-android-source.py'], { cwd: root, stdio: 'inherit' });
const copies = [
  [join(release, 'app-arm64-v8a-release.apk'), 'sonora-android.apk'],
  [join(release, 'app-armeabi-v7a-release.apk'), 'sonora-android-arm32.apk'],
  [join(root, 'mobile-artifacts/sonora-android-source.zip'), 'sonora-android-source.zip']
];
const manifest = { version, versionCode: metadata.elements[0].versionCode, files: {} };
for (const [source, name] of copies) {
  await copyFile(source, join(staticFiles, name));
  const bytes = await readFile(source);
  manifest.files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await copyFile(join(root, 'public/licenses.html'), join(staticFiles, 'licenses.html'));
await cp(join(root, 'public/licenses'), join(staticFiles, 'licenses'), { recursive: true });
const template = await readFile(join(root, 'mobile/installer.html'), 'utf8');
await writeFile(join(staticFiles, 'index.html'), template.replaceAll('{{VERSION}}', version)
  .replaceAll('{{SIZE_MB}}', String(Math.round(manifest.files['sonora-android.apk'].bytes / 1024 / 1024))));
await writeFile(join(staticFiles, 'checksums.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(destination, 'config.json'), JSON.stringify({ version: 3, routes: [
  ...copies.map(([, name]) => ({ src: `/${name}`, headers: {
    'Content-Type': name.endsWith('.apk') ? 'application/vnd.android.package-archive' : 'application/zip',
    'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store'
  } })), { handle: 'filesystem' }
] }, null, 2));
await mkdir(join(root, 'mobile-artifacts/android-installer/.vercel'), { recursive: true });
await copyFile(join(root, '.vercel/project.json'), join(root, 'mobile-artifacts/android-installer/.vercel/project.json')).catch(() => {});
console.log(`Packaged Android ${version}; arm64 SHA-256 ${manifest.files['sonora-android.apk'].sha256}`);
if (process.argv.includes('--public')) {
  await cp(staticFiles, join(root, 'public/downloads'), { recursive: true });
  console.log('Prepared public website downloads under public/downloads. Deploy the complete website from the repository root.');
}
