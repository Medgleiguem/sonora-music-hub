import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

function isYoutubeUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isPlaylistUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.pathname === '/playlist' || parsed.searchParams.has('list');
  } catch {
    return false;
  }
}

export async function GET(request) {
  const worker = process.env.DOWNLOADER_URL?.replace(/\/$/, '');
  const secret = process.env.DOWNLOADER_API_KEY?.trim();
  const source = new URL(request.url).searchParams.get('url') || '';
  if (!worker || !secret) return NextResponse.json({ error: 'The audio conversion worker is not configured.' }, { status: 503 });
  if (!isYoutubeUrl(source) || !isPlaylistUrl(source)) {
    return NextResponse.json({ error: 'Paste a valid YouTube playlist URL.' }, { status: 400 });
  }

  const expires = Math.floor(Date.now() / 1000) + 300;
  const signature = createHmac('sha256', secret).update(`${expires}\n${source}\nplaylist`).digest('hex');
  const target = new URL(`${worker}/api/youtube/playlist`);
  target.searchParams.set('url', source);
  target.searchParams.set('expires', String(expires));
  target.searchParams.set('signature', signature);
  return NextResponse.redirect(target, 307);
}
