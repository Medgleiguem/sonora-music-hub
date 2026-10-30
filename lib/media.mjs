import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ffmpegPath from 'ffmpeg-static';
import { runProcess } from './process.mjs';
import { formats, MAX_AUDIO_BYTES, validateVideo, publicMediaError, youtubeMixSeed, playlistExtractionSource } from './youtube-input.mjs';
import { catalogEntries, playlistBatch } from './youtube-catalog.mjs';

const ytDlpPath = () => process.env.YT_DLP_PATH || join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const baseArgs = () => [
  '--ignore-config', '--no-cache-dir', '--no-warnings', '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1',
  '--no-js-runtimes', '--js-runtimes', `node:${process.execPath}`,
  ...(process.env.YT_DLP_PROXY ? ['--proxy', process.env.YT_DLP_PROXY] : []),
  ...(process.env.YT_DLP_COOKIES_PATH ? ['--cookies', process.env.YT_DLP_COOKIES_PATH] : [])
];
const runYtDlp = (args, options) => runProcess(ytDlpPath(), [...baseArgs(), ...args], options);
let activeConversions = 0;
let activeLookups = 0;

export async function lookupYoutube(source, { signal, limit = 24, type = 'video', start = 1, paged = false } = {}) {
  if (activeLookups >= 4) throw new Error('The converter is busy. Try again in a moment.');
  activeLookups++;
  try {
    const mix = paged && Boolean(youtubeMixSeed(source));
    if (mix && start > 100) return playlistBatch({}, { start, limit, sourceUrl: source });
    const end = mix ? Math.min(start + limit, 101) : paged ? start + limit : limit;
    const text = await runYtDlp(['--flat-playlist', '--playlist-start', String(start), '--playlist-end', String(end), '--dump-single-json', '--skip-download', '--', paged ? playlistExtractionSource(source) : source], { signal });
    const data = JSON.parse(text);
    if (paged) return playlistBatch(data, { start, limit, sourceUrl: source });
    return { title: data.title || 'YouTube', entries: catalogEntries(data, type) };
  } finally { activeLookups--; }
}

export async function convertAudio(input, output, format, signal) {
  const codec = format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : format === 'm4a' ? ['-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'] : ['-c:a', 'libopus', '-b:a', '128k'];
  await runProcess(process.env.FFMPEG_PATH || ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-threads', '1', ...codec, output], { signal, timeoutMs: 240_000 });
}

export async function* downloadEvents(source, format, signal) {
  if (activeConversions >= 2) throw new Error('The converter is busy. Try again in a moment.');
  activeConversions++;
  let directory;
  let diskGuard;
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const deadline = setTimeout(() => controller.abort(new DOMException('Conversion deadline reached', 'TimeoutError')), 260_000);
  try {
    yield { type: 'stage', stage: 'preparing', message: 'Checking the video…' };
    directory = await mkdtemp(join(tmpdir(), 'sonora-'));
    const info = JSON.parse(await runYtDlp(['--no-playlist', '--dump-single-json', '--skip-download', '--', source], { cwd: directory, signal: combined }));
    validateVideo(info);
    yield { type: 'stage', stage: 'downloading', message: 'Downloading source audio…' };
    // Also bound downloads whose upstream Content-Length is unknown.
    diskGuard = setInterval(async () => {
      try {
        const files = await readdir(directory);
        const sizes = await Promise.all(files.map((file) => stat(join(directory, file)).then((info) => info.size).catch(() => 0)));
        if (sizes.reduce((sum, size) => sum + size, 0) > 160 * 1024 * 1024) controller.abort(new Error('The source file is too large. Choose a shorter video.'));
      } catch { /* Directory has already been removed. */ }
    }, 1000);
    const input = join(directory, 'source');
    await runYtDlp(['--no-playlist', '--no-progress', '--no-simulate', '--fixup', 'never', '--format', 'bestaudio/best', '--max-filesize', '96M', '--match-filters', '!is_live & duration <= 1800', '--output', input, '--', source], { cwd: directory, signal: combined, timeoutMs: 240_000 });
    const sourceInfo = await stat(input).catch(() => null);
    if (!sourceInfo || sourceInfo.size > 96 * 1024 * 1024) throw new Error('The source file is unavailable or too large. Choose a shorter video.');
    yield { type: 'stage', stage: 'converting', message: `Converting to ${format.toUpperCase()}…` };
    const output = join(directory, `audio.${format}`);
    await convertAudio(input, output, format, combined);
    const size = (await stat(output)).size;
    if (!size || size > MAX_AUDIO_BYTES) throw new Error('The audio file is empty or too large. Choose a shorter video.');
    yield { type: 'metadata', title: String(info.title || 'YouTube audio').slice(0, 180), size, mime: formats[format] };
    const file = createReadStream(output, { highWaterMark: 48 * 1024, signal: combined });
    for await (const chunk of file) yield { type: 'audio', data: chunk.toString('base64') };
    yield { type: 'complete' };
  } finally {
    clearTimeout(deadline);
    clearInterval(diskGuard);
    controller.abort();
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    activeConversions--;
  }
}

export function mediaResponse(source, format, requestSignal) {
  const abort = new AbortController();
  const signal = AbortSignal.any([requestSignal, abort.signal]);
  const iterator = downloadEvents(source, format, signal);
  const encoder = new TextEncoder();
  let cancelled = false;
  return new Response(new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (cancelled) return;
        if (done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      } catch (error) {
        if (!cancelled) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', message: publicMediaError(error) })}\n`));
          controller.close();
        }
      }
    },
    async cancel() {
      cancelled = true;
      abort.abort();
      await iterator.return();
    }
  }), { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' } });
}
