# Android-first free deployment

The user-approved free architecture now includes a native Android app alongside this Next.js PWA. The Android app downloads and converts on the phone; the hosted website offers its installer and file imports. Vercel conversion requests fail quickly with `ANDROID_DOWNLOAD_REQUIRED` because real YouTube requests from the hosting connection were refused. Local Next.js conversion remains available. See [Android build/use details](docs/android.md) and [current launch evidence](docs/vercel-launch.md).

The public Android installer is at https://sonora-music-hub-six.vercel.app/android and requires no Vercel login. It serves signed APKs, application source and SHA-256 checksums alongside the full music website. Build and sign Android first, then run `npm run package:android -- --public` to prepare ignored `public/downloads/` assets before deploying from the repository root. Those binary artifacts are deliberately excluded from Git; future website releases must prepare them again to retain the download page. CI does not deploy. Do not enable a clean-source automatic deployment without an equivalent release-artifact step.

The default `npm run package:android` still prepares the separate installer Build Output for preview/review. Never promote an installer-only deployment onto the main music website domain. Contributors can [build from public source](docs/android.md#build) without signing credentials or Vercel access.

## Next.js hosting configuration

1. Import this repository as a **Next.js** project with the repository root as the root directory.
2. Select **Node.js 22.x or 24.x** and enable **Fluid compute**. Use `npm ci` to install and `npm run build` to build. Do not select a static export.
3. Add optional values from `.env.example`. A YouTube API key speeds up search but is not needed for conversion or the yt-dlp search fallback.
4. Deploy. The build downloads pinned yt-dlp and installs FFmpeg; `next.config.mjs` includes both executables in the Node API bundles. No Python installation, Docker container, Render service, server database, or persistent disk is required.
5. Verify search, local file imports, playback, storage recovery and offline reopen on the deployed origin. Vercel download requests intentionally return the Android alternative; use the native Android app for phone downloads.

## Existing Vercel + Render installations

Deploy the new Next.js build to the **same existing origin** to keep access to the browser's IndexedDB library. A new domain or preview URL has a separate browser library.

`DOWNLOADER_URL`, `DOWNLOADER_API_KEY`, `ALLOWED_ORIGINS`, and worker port/host settings are no longer read by this app. Remove them from Vercel when convenient. Confirm the Android and browser flows before changing any old Render service. This code change does not delete or change any external service.

Close old Sonora tabs and reopen after deployment so the service worker can activate the new shell. Do not clear site data to update the app: that would delete local music. Old open tabs use the previous download protocol until refreshed; a deployment while downloading can interrupt an in-flight request.

## Runtime design and limits

- The download Node route declares `maxDuration = 300`. It sends an immediate NDJSON status event and streams audio after conversion, avoiding buffering the complete file in a function response. Vercel's [body-size guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) documents streaming for large responses.
- The server sets a **260-second deadline** including transfer. Client requests stop after 285 seconds. Work that cannot finish within this budget fails visibly; streaming does not remove the execution limit. See [Vercel function limits](https://vercel.com/docs/functions/limitations).
- Each invocation uses a unique `/tmp/sonora-*` directory. Cancellation and deadlines kill the process group; generator cleanup removes temporary media. Abrupt platform termination cannot run JavaScript cleanup, so no data in `/tmp` is treated as persistent.
- Two conversions and four lookups are allowed per warm instance. These are resource guards, **not a global rate limit**: Vercel can create more instances. For an internet-facing service, configure Vercel Firewall rate limits or deployment protection to match your intended audience and budget. The app has no user accounts; its API is public on a public deployment. The Origin check is not authentication.
- Finished videos up to 30 minutes / 96 MiB source / 64 MiB output; playlists up to 100 entries. On slower conversions even smaller files may reach the deadline. Large uninterrupted album-length conversions require a different execution model.
- yt-dlp and FFmpeg are ordinary server executables, not a persistent worker. They are installed at build time and never self-update at runtime. Update the pinned release and hashes in `scripts/setup-media.mjs` when YouTube changes require a newer extractor. Official sources: [yt-dlp](https://github.com/yt-dlp/yt-dlp), [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static).

## Troubleshooting

- **Tool download fails during build:** ensure npm install scripts are enabled for `ffmpeg-static`, and GitHub release downloads are accessible. The setup script checks SHA-256 and fails the build if the executable cannot be installed. It retries with curl if Node's download path fails.
- **YouTube refuses a request:** a functioning build does not guarantee YouTube accepts a connection. The Android 1.2.0 live probes were refused too; changing platforms does not guarantee a fix. File imports remain available. This deployment uses no paid proxy or download API.
- **Search quota exhausted:** provide a usable server-side `YOUTUBE_API_KEY` or remove it to use yt-dlp search.
- **Storage full:** free device space or remove unwanted saved tracks, then retry. Completed playlist entries are retained.
- **Offline startup shows an older UI:** connect once, close all Sonora tabs, and reopen. Preserve site data.
