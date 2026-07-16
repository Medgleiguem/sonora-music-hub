import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const term = searchParams.get('q')?.trim() || '';
  const region = (searchParams.get('region') || process.env.YOUTUBE_REGION || 'US').toUpperCase();
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    const worker = process.env.DOWNLOADER_URL?.replace(/\/$/, '');
    const workerKey = process.env.DOWNLOADER_API_KEY?.trim();
    if (!worker || !workerKey) return NextResponse.json({ error: 'Configure YOUTUBE_API_KEY or the protected downloader worker.' }, { status: 503 });
    if (!term) return NextResponse.json({ results: [] });
    try {
      const response = await fetch(`${worker}/api/youtube/search?q=${encodeURIComponent(term)}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${workerKey}` }
      });
      const data = await response.json();
      return NextResponse.json(data, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return NextResponse.json({ error: error.message || 'The YouTube search worker is unavailable.' }, { status: 502 });
    }
  }

  try {
    const params = new URLSearchParams({ key, part: 'snippet', maxResults: '24', type: 'video', videoCategoryId: '10' });
    if (term) params.set('q', term);
    else { params.set('order', 'viewCount'); params.set('regionCode', region); }
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { next: { revalidate: term ? 0 : 300 } });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data.error?.message || 'YouTube search failed.' }, { status: response.status });

    const videoIds = data.items.map((item) => item.id?.videoId).filter(Boolean);
    if (!videoIds.length) return NextResponse.json({ results: [] });
    const detailParams = new URLSearchParams({ key, part: 'contentDetails,status', id: videoIds.join(',') });
    const detailResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`, { cache: 'no-store' });
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
    return NextResponse.json({ error: error.message || 'YouTube search failed.' }, { status: 502 });
  }
}

function parseDuration(value = '') {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}

function decodeHtml(value = '') {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
