import { mediaResponse } from '../../../../lib/media.mjs';
import { audioFormat, youtubeSource } from '../../../../lib/youtube-input.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Open the download tool in Sonora to continue.' }, { status: 403 });
  let source, format;
  try {
    if (Number(request.headers.get('content-length')) > 4096) throw new Error('The request is too large.');
    const body = await request.json();
    source = youtubeSource(body.url);
    format = audioFormat(body.format || 'mp3');
  } catch (error) { return Response.json({ error: error.message || 'Invalid download request.' }, { status: 400 }); }
  if (process.env.VERCEL === '1') return Response.json({
    error: 'YouTube downloads are available in the Sonora Android app. You can also import audio files on this device.',
    code: 'ANDROID_DOWNLOAD_REQUIRED'
  }, { status: 503 });
  return mediaResponse(source, format, request.signal);
}
