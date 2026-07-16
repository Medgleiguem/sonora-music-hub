import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  try {
    const target = new URL(`${worker}/api/youtube/playlist`);
    target.searchParams.set('url', source);
    const response = await fetch(target, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000)
    });
    const body = await response.text();
    if (!response.ok) return NextResponse.json({ error: body || 'Could not read that playlist.' }, { status: response.status });
    return new NextResponse(body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('Playlist worker request failed', {
      name: error?.name,
      message: error?.message,
      cause: error?.cause?.code || error?.cause?.message
    });
    return NextResponse.json({ error: 'Could not reach the audio conversion worker.' }, { status: 502 });
  }
}
