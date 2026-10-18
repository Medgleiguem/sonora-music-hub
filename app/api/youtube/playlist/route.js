import { lookupYoutube } from '../../../../lib/media.mjs';
import { youtubeSource, publicMediaError } from '../../../../lib/youtube-input.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request) {
  let source;
  try { source = youtubeSource(new URL(request.url).searchParams.get('url') || '', true); }
  catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
  try {
    const configured = Number(process.env.PLAYLIST_MAX_ITEMS || 100);
    const limit = Number.isFinite(configured) ? Math.min(100, Math.max(1, Math.floor(configured))) : 100;
    const data = await lookupYoutube(source, { signal: request.signal, limit });
    if (!data.entries.length) return Response.json({ error: 'This playlist has no available videos.' }, { status: 404 });
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: publicMediaError(error) }, { status: 502 }); }
}
