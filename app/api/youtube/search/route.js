import { NextResponse } from 'next/server';
import { lookupYoutube } from '../../../../lib/media.mjs';
import { publicMediaError } from '../../../../lib/youtube-input.mjs';

export const maxDuration = 60;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const term = searchParams.get('q')?.trim() || '';
  const region = (searchParams.get('region') || process.env.YOUTUBE_REGION || 'US').toUpperCase();
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (term.length > 200 || !/^[A-Z]{2}$/.test(region)) return NextResponse.json({ error: 'Enter a search of up to 200 characters and a two-letter region.' }, { status: 400 });
  if (!key) {
    try {
      const query = term || `popular music ${region}`;
      const data = await lookupYoutube(`ytsearch24:${query}`, { signal: request.signal });
      return NextResponse.json({ results: data.entries }, { headers: { 'Cache-Control': 'private, max-age=60' } });
    } catch (error) { return NextResponse.json({ error: publicMediaError(error) }, { status: 502 }); }
  }

  try {
    const params = new URLSearchParams({ key, part: 'snippet', maxResults: '24', type: 'video', videoCategoryId: '10' });
    if (term) params.set('q', term);
    else { params.set('order', 'viewCount'); params.set('regionCode', region); }
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]), next: { revalidate: term ? 0 : 300 } });
    const data = await response.json();
    if (!response.ok) {
      const quotaLimited = response.status === 403 || response.status === 429;
      const message = quotaLimited
        ? 'YouTube search quota is temporarily exhausted. Please try again later.'
        : data.error?.message || 'YouTube search failed.';
      return NextResponse.json({ error: message, code: quotaLimited ? 'YOUTUBE_QUOTA_EXHAUSTED' : 'YOUTUBE_SEARCH_FAILED' }, { status: response.status });
    }

    const videoIds = data.items.map((item) => item.id?.videoId).filter(Boolean);
    if (!videoIds.length) return NextResponse.json({ results: [] });
    const detailParams = new URLSearchParams({ key, part: 'contentDetails,status', id: videoIds.join(',') });
    const detailResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`, { cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) });
    const details = await detailResponse.json();
    const detailMap = new Map((details.items || []).map((item) => [item.id, item]));
    const results = data.items.map((item) => {
      const id = item.id.videoId;
      const detail = detailMap.get(id);
      return {
        id: `youtube-${id}`,
        externalId: id,
        title: decodeHtml(item.snippet.title),
        artist: decodeHtml(item.snippet.channelTitle),
        album: 'YouTube',
        duration: parseDuration(detail?.contentDetails?.duration),
        cover: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
        shareUrl: `https://www.youtube.com/watch?v=${id}`,
        source: 'youtube'
      };
    }).filter((item) => detailMap.get(item.externalId)?.status?.embeddable !== false);
    return NextResponse.json({ results }, { headers: { 'Cache-Control': term ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch (error) {
    return NextResponse.json({ error: 'YouTube search is unavailable. Please try again.' }, { status: 502 });
  }
}

function parseDuration(value = '') {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}

function decodeHtml(value = '') {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
