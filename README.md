# Sonora

Sonora is a mobile-first, local-first music PWA built with Next.js. It can search YouTube, convert authorized videos to MP3/M4A/Opus through a private worker, save the result on the current device, import local audio and folders, build playlists, and play downloaded music offline.

## Architecture

- **Next.js app on Vercel:** UI, protected search proxy, and short-lived signed download URLs.
- **Conversion worker on Render:** `yt-dlp` and FFmpeg convert one video at a time and stream the result directly to the browser.
- **On-device library:** audio blobs, metadata, favorites, and playlists live in IndexedDB.
- **Recovery copy:** YouTube downloads can also be written to the phone's Downloads/Files area.
- **PWA shell:** the service worker caches the app UI, but intentionally never caches API or audio-conversion responses.

The Render filesystem is used only for temporary conversion files, which are deleted after each request. A server database and persistent Render disk are not required.

## Local development

Requirements:

- Node.js 22+
- npm 10+
- FFmpeg
- `yt-dlp`

Create local configuration:

```bash
cp .env.example .env.local
```

Set a long random value for `DOWNLOADER_API_KEY`, then run the app and worker in separate terminals:

```bash
npm ci
npm run dev
```

```bash
npm run downloader
```

Open `http://localhost:3000`.

## Environment variables

### Vercel

- `DOWNLOADER_URL`: public HTTPS URL of the Render worker, without a trailing slash.
- `DOWNLOADER_API_KEY`: the same long random secret configured on Render.
- `NEXT_PUBLIC_YOUTUBE_ENABLED=true`: enables the YouTube discovery UI.
- `YOUTUBE_API_KEY`: optional server-only YouTube Data API v3 key. Without it, search falls back to the protected Render worker.
- `YOUTUBE_REGION`: optional two-letter search region, such as `US`.
- `NEXT_PUBLIC_YOUTUBE_REGION`: optional matching browser default.
- `NEXT_PUBLIC_JAMENDO_CLIENT_ID`: optional independent-music catalog.

### Render

- `DOWNLOADER_API_KEY`: exactly the same secret used on Vercel.
- `ALLOWED_ORIGINS`: exact comma-separated Vercel/custom-domain origins, for example `https://sonora.example.com,https://sonora.vercel.app`.
- `YT_DLP_PATH=yt-dlp`: already supplied by `render.yaml`.
- `YT_DLP_PROXY`: optional trusted proxy URL used only by the server-side yt-dlp process.
- `YT_DLP_COOKIES_PATH`: optional path to a private Netscape-format cookies file, such as `/etc/secrets/youtube-cookies.txt` on Render.

Never prefix private keys with `NEXT_PUBLIC_`. Never commit `.env` files.

Some hosting-provider IP ranges are challenged by YouTube even when yt-dlp is fully up to date. For a personal production deployment, prefer a reputable static residential proxy. A dedicated throwaway YouTube account exported to a Render secret file is a fallback, but YouTube can invalidate or restrict that account.

## Production deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full Vercel + Render sequence.

The repository includes:

- `Dockerfile` for the conversion worker
- `render.yaml` Render Blueprint
- `vercel.json` Vercel configuration
- `/health` worker health check

Use a paid always-on Render web service if reliable downloads are required. A sleeping/free instance adds cold-start delays and cannot provide an always-ready production experience.

## Offline storage and recovery

When audio is imported or downloaded, Sonora asks the browser for persistent storage and saves the audio in IndexedDB. Installed PWA playback works without internet after the app shell has been opened once and the tracks have finished saving.

Browser storage alone cannot truthfully guarantee that a file is impossible to lose. Clearing site data, uninstalling a browser/PWA, an operating-system reset, or losing the phone can remove IndexedDB. Keep **“Also keep a recovery copy in Downloads/Files”** enabled for converted tracks. Those physical files can be imported back into Sonora later.

For the safest phone setup:

1. Install Sonora to the home screen.
2. Keep recovery copies enabled.
3. Do not clear Sonora/browser site storage.
4. Include the phone's Downloads/Files folder in the device's normal cloud or computer backup.

## Security and limits

- Search requests to the worker require a bearer secret.
- Download requests use five-minute HMAC-signed URLs.
- Worker CORS is restricted to configured app origins.
- Only recognized YouTube hosts and MP3/M4A/Opus output formats are accepted.
- Downloads are limited to 200 MB and two simultaneous conversions per worker instance.
- Temporary conversion files are deleted after the response closes.

Use the downloader only for content you own or have permission to save, and comply with applicable terms and laws.
