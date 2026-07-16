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

export async function GET(request) {
  const worker = process.env.DOWNLOADER_URL?.replace(/\/$/, '');
  const secret = process.env.DOWNLOADER_API_KEY?.trim();
  if (!worker || !secret) return NextResponse.json({ error: 'The audio conversion worker is not configured.' }, { status: 503 });
  const incoming = new URL(request.url);
  const source = incoming.searchParams.get('url') || '';
  const format = incoming.searchParams.get('format') || 'mp3';
  if (!isYoutubeUrl(source)) {
    return NextResponse.json({ error: 'Only valid YouTube URLs are supported.' }, { status: 400 });
  }
  if (!['mp3', 'm4a', 'opus'].includes(format)) {
    return NextResponse.json({ error: 'Unsupported audio format.' }, { status: 400 });
  }

  const expires = Math.floor(Date.now() / 1000) + 300;
  const signature = createHmac('sha256', secret).update(`${expires}\n${source}\n${format}`).digest('hex');
  const target = new URL(`${worker}/api/youtube/download`);
  target.searchParams.set('url', source);
  target.searchParams.set('format', format);
  target.searchParams.set('expires', String(expires));
  target.searchParams.set('signature', signature);
  return NextResponse.redirect(target, 307);
}
