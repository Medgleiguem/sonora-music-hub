import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Official nightly includes matching challenge scripts and the maintained YouTube
// default-client fix in yt-dlp PR #17805. SHA verified against official SHA2-256SUMS.
// https://github.com/yt-dlp/yt-dlp/pull/17805
export const androidEngine = {
  version: '2026.10.10.233141',
  repository: 'yt-dlp/yt-dlp-nightly-builds',
  sha256: 'f40b6a9e4c5786360953911cab5d2f87507626b8fb7bfee3f8f1c2e5cf341fae'
};
const directory = fileURLToPath(new URL('../android/app/src/main/assets/downloader/', import.meta.url));
const target = `${directory}yt-dlp`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(directory, { recursive: true });
const cached = await readFile(target).catch(() => null);
if (!cached || digest(cached) !== androidEngine.sha256) {
  const url = `https://github.com/${androidEngine.repository}/releases/download/${androidEngine.version}/yt-dlp`;
  console.log(`Installing Android downloader ${androidEngine.version}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`Android downloader download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== androidEngine.sha256) throw new Error('Android downloader checksum mismatch.');
  const temporary = `${target}.${process.pid}.tmp`;
  try { await writeFile(temporary, bytes); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }); }
}
await writeFile(`${directory}version.json`, JSON.stringify(androidEngine));
console.log(`Android downloader ${androidEngine.version} verified.`);
