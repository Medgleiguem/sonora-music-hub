import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import { access, mkdir, readFile, writeFile, chmod, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

await access(ffmpeg, constants.X_OK).catch(() => { throw new Error('FFmpeg is unavailable. Enable npm install scripts for ffmpeg-static and run npm ci again.'); });

const version = '2026.08.19';
const releases = {
  'linux-x64': ['yt-dlp_linux', '58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a'],
  'linux-arm64': ['yt-dlp_linux_aarch64', 'b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc'],
  'darwin-x64': ['yt-dlp_macos', '0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202'],
  'darwin-arm64': ['yt-dlp_macos', '0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202'],
  'win32-x64': ['yt-dlp.exe', '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a']
};
const release = releases[`${process.platform}-${process.arch}`];
if (!release) throw new Error('Unsupported media tool platform. Use Linux x64/arm64, macOS, or Windows x64.');
const [asset, digest] = release;
const directory = join(process.cwd(), 'bin');
const target = join(directory, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
await mkdir(directory, { recursive: true });
const cached = await readFile(target).catch(() => null);
if (!cached || sha256(cached) !== digest) {
  console.log(`Installing yt-dlp ${version} (${asset})`);
  const url = `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/${asset}`;
  let bytes;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {
    // Some build networks route Node and curl differently. Both paths verify the pinned hash.
    const download = `${target}.${process.pid}.download`;
    try {
      await promisify(execFile)('curl', ['--fail', '--silent', '--show-error', '--location', '--retry', '2', '--connect-timeout', '15', '--max-time', '120', url, '--output', download], { timeout: 180_000 });
      bytes = await readFile(download);
    } finally { await rm(download, { force: true }); }
  }
  if (sha256(bytes) !== digest) throw new Error('Media tool checksum verification failed.');
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o755 });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}
await chmod(target, 0o755);
console.log(`yt-dlp ${version} verified.`);
