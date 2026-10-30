// CI tests installer navigation with intercepted APK requests, without signing keys or release binaries.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('public/downloads/', root);
await mkdir(output, { recursive: true });
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const template = await readFile(new URL('mobile/installer.html', root), 'utf8');
await writeFile(new URL('index.html', output), template
  .replaceAll('{{VERSION}}', version).replaceAll('{{UPDATED}}', 'CI test fixture')
  .replaceAll('{{SIZE_MB}}', '0').replaceAll('{{ARM32_SIZE_MB}}', '0'));
const start = await readFile(new URL('mobile/download-start.html', root), 'utf8');
for (const [arch, label] of [['arm64', '64-bit Android'], ['arm32', '32-bit Android']]) {
  await writeFile(new URL(`start-${arch}.html`, output), start
    .replaceAll('{{ARCH}}', arch).replaceAll('{{ANDROID_LABEL}}', label));
}
await cp(new URL('mobile/store/', root), new URL('store/', output), { recursive: true });
console.log(`Prepared browser-only download fixtures in ${fileURLToPath(output)}`);
