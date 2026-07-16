import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';

const port = Number(process.env.PORT || process.env.DOWNLOADER_PORT || 8787);
const host = process.env.DOWNLOADER_HOST || '0.0.0.0';
const ytDlp = process.env.YT_DLP_PATH || 'yt-dlp';
const apiKey = process.env.DOWNLOADER_API_KEY?.trim() || '';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map((item) => item.trim()).filter(Boolean);
const proxy = process.env.YT_DLP_PROXY?.trim() || '';
const cookiesPath = process.env.YT_DLP_COOKIES_PATH?.trim() || '';
const allowedHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const formats = { mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/opus' };
const maxUrlLength = 2048;
const maxConcurrent = 2;
const configuredPlaylistLimit = Number(process.env.PLAYLIST_MAX_ITEMS || 100);
const maxPlaylistItems = Number.isFinite(configuredPlaylistLimit)
  ? Math.min(Math.max(Math.floor(configuredPlaylistLimit), 1), 250)
  : 100;
const ytDlpBaseArgs = [
  '--js-runtimes', 'node',
  ...(proxy ? ['--proxy', proxy] : []),
  ...(cookiesPath ? ['--cookies', cookiesPath] : [])
];
let activeDownloads = 0;

const send = (response, status, body, type = 'text/plain') => {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
};

const authorizeBearer = (request) => apiKey && request.headers.authorization === `Bearer ${apiKey}`;

const authorizeDownload = (requestUrl, request) => {
  if (authorizeBearer(request)) return true;
  if (!apiKey) return false;
  const source = requestUrl.searchParams.get('url') || '';
  const format = requestUrl.searchParams.get('format') || '';
  const expires = Number(requestUrl.searchParams.get('expires') || 0);
  const provided = requestUrl.searchParams.get('signature') || '';
  if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 600) return false;
  const expected = createHmac('sha256', apiKey).update(`${expires}\n${source}\n${format}`).digest('hex');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
};

const allowCors = (request, response) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition, X-Track-Title');
  }
};

const isYoutubeUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && allowedHosts.has(parsed.hostname.toLowerCase());
  } catch { return false; }
};

const run = (args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(ytDlp, [...ytDlpBaseArgs, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `yt-dlp exited with ${code}`)));
});

const downloaderError = (error) => {
  const message = error.code === 'ENOENT' ? 'yt-dlp is not installed or is not on PATH.' : error.message;
  if (/sign in to confirm you.re not a bot/i.test(message)) {
    return {
      status: 503,
      message: 'YouTube is blocking this downloader server. Configure a trusted proxy or private YouTube cookies and try again.'
    };
  }
  return { status: 502, message: message.slice(0, 500) };
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  allowCors(request, response);
  if (requestUrl.pathname === '/health') return send(response, 200, JSON.stringify({ ok: true, activeDownloads }), 'application/json');
  if (!apiKey) return send(response, 503, 'DOWNLOADER_API_KEY is not configured.');
  if (request.method !== 'GET') return send(response, 405, 'Method not allowed');
  if (requestUrl.pathname === '/api/youtube/search') {
    if (!authorizeBearer(request)) return send(response, 401, 'Unauthorized');
    const query = requestUrl.searchParams.get('q')?.trim() || '';
    if (!query || query.length > 200) return send(response, 400, 'Enter a search query up to 200 characters.');
    try {
      const payload = await run([`ytsearch24:${query}`, '--flat-playlist', '--playlist-end', '24', '--dump-single-json', '--skip-download', '--no-warnings'], process.cwd());
      const data = JSON.parse(payload);
      const results = (data.entries || []).filter((entry) => entry?.id).map((entry) => ({
        id: `youtube-${entry.id}`,
        externalId: entry.id,
        title: entry.title || 'Untitled video',
        artist: entry.channel || entry.uploader || 'YouTube',
        album: 'YouTube',
        duration: Number(entry.duration) || 0,
        cover: entry.thumbnail || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
        shareUrl: entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`,
        source: 'youtube'
      }));
      return send(response, 200, JSON.stringify({ results }), 'application/json');
    } catch (error) {
      const failure = downloaderError(error);
      return send(response, failure.status, failure.message);
    }
  }
  if (requestUrl.pathname === '/api/youtube/playlist') {
    if (!authorizeBearer(request)) return send(response, 401, 'Unauthorized');
    const source = requestUrl.searchParams.get('url') || '';
    if (source.length > maxUrlLength) return send(response, 400, 'The URL is too long.');
    if (!isYoutubeUrl(source)) return send(response, 400, 'Only valid YouTube playlist URLs are supported.');
    try {
      const payload = await run([
        source,
        '--flat-playlist',
        '--playlist-end', String(maxPlaylistItems),
        '--dump-single-json',
        '--skip-download',
        '--no-warnings'
      ], process.cwd());
      const data = JSON.parse(payload);
      const entries = (data.entries || []).filter((entry) => entry?.id).map((entry) => ({
        externalId: entry.id,
        title: entry.title || 'Untitled video',
        artist: entry.channel || entry.uploader || 'YouTube',
        album: data.title || 'YouTube playlist',
        duration: Number(entry.duration) || 0,
        cover: entry.thumbnail || `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
        shareUrl: entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`,
        source: 'youtube'
      }));
      if (!entries.length) return send(response, 404, 'This playlist has no downloadable videos.');
      return send(response, 200, JSON.stringify({ title: data.title || 'YouTube playlist', entries, limited: (data.playlist_count || entries.length) > entries.length }), 'application/json');
    } catch (error) {
      const failure = downloaderError(error);
      return send(response, failure.status, failure.message);
    }
  }
  if (requestUrl.pathname !== '/api/youtube/download') return send(response, 404, 'Not found');
  if (!authorizeDownload(requestUrl, request)) return send(response, 401, 'Unauthorized');
  const source = requestUrl.searchParams.get('url') || '';
  const format = requestUrl.searchParams.get('format') || 'mp3';
  if (source.length > maxUrlLength) return send(response, 400, 'The URL is too long.');
  if (!isYoutubeUrl(source)) return send(response, 400, 'Only valid YouTube video URLs are supported.');
  if (!formats[format]) return send(response, 400, 'Unsupported audio format.');
  if (activeDownloads >= maxConcurrent) return send(response, 429, 'The downloader is busy. Try again in a moment.');

  let directory;
  activeDownloads += 1;
  try {
    directory = await mkdtemp(join(tmpdir(), 'sonora-'));
    const output = join(directory, 'audio.%(ext)s');
    const title = await run([source, '--no-playlist', '--print', 'title', '--skip-download', '--no-warnings'], directory);
    await run([source, '--no-playlist', '--extract-audio', '--audio-format', format, '--audio-quality', '0', '--max-filesize', '200M', '--no-warnings', '--output', output], directory);
    const extension = format === 'mp3' ? 'mp3' : format;
    const filePath = join(directory, `audio.${extension}`);
    const fileInfo = await stat(filePath);
    response.writeHead(200, { 'Content-Type': formats[format], 'Content-Length': fileInfo.size, 'Content-Disposition': `attachment; filename="audio.${extension}"`, 'X-Track-Title': encodeURIComponent(title.slice(0, 180)), 'Cache-Control': 'no-store' });
    await new Promise((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on('error', reject);
      response.on('close', resolve);
      response.on('finish', resolve);
      stream.pipe(response);
    });
  } catch (error) {
    const failure = downloaderError(error);
    send(response, failure.status, failure.message);
  } finally {
    activeDownloads -= 1;
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
});

server.listen(port, host, () => console.log(`Sonora downloader listening on http://${host}:${port}`));

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
