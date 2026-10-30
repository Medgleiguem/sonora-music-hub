import { spotifySource, spotifyEmbedUrl, nextDataJson, spotifyCollection } from '../../../../lib/spotify-catalog.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function limitedText(response, maxBytes) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let result = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return result + decoder.decode();
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('The Spotify response is too large.'); }
    result += decoder.decode(value, { stream: true });
  }
}

export async function GET(request) {
  let source;
  try { source = spotifySource(new URL(request.url).searchParams.get('url') || ''); }
  catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
  try {
    const response = await fetch(spotifyEmbedUrl(source), {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)])
    });
    if (!response.ok || !response.body) throw new Error('Spotify is unavailable. Try again later.');
    const data = spotifyCollection(nextDataJson(await limitedText(response, 4 * 1024 * 1024)), source);
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Spotify took too long to respond. Try again.'
      : /^(This Spotify link|Spotify )/.test(error.message) ? error.message : 'Could not read this Spotify link. Try again later.';
    return Response.json({ error: message }, { status: 502 });
  }
}
