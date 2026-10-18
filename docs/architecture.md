# Architecture

Sonora has two execution environments sharing `src/App.jsx` and the IndexedDB library in `src/db.js`. There is no application account, server music database or library synchronization.

## Web

Next.js serves the interface and same-origin routes under `app/api/youtube/`. Optional server-only Data API credentials support search; yt-dlp is the fallback. `lib/media.mjs` runs bounded yt-dlp/FFmpeg subprocesses. Downloads use a progress/audio streaming protocol parsed by `src/download-stream.mjs`; interrupted output is not saved as a complete track. Temporary server files are removed on normal completion/cancellation.

The public Vercel build deliberately returns an Android alternative for conversion requests because live YouTube conversion there was refused. Local or compatible Node hosts retain conversion. Browser YouTube playback uses the visible embedded player; it does not gain Android background playback capabilities.

The service worker caches the application shell and assets, not API/download responses. Audio, metadata and playlists live in browser IndexedDB. Deployment origins have separate libraries.

## Android

`scripts/build-mobile.mjs` builds the same React interface with esbuild. Capacitor loads it from the app; private server credentials are not part of that bundle.

`SonoraMediaPlugin` exposes the native search and download path. `NativeMedia` validates sources, installs the pinned extractor atomically, performs bounded/coalesced lookups and resolves on-demand audio sources. `MediaProcess` controls output limits, subprocess cancellation and deadlines. `DownloadService` owns the current foreground conversion; saving a completed track and starting later playlist entries require the UI to return.

`PlaybackPlugin` connects the UI to `PlaybackService`, a Media3 `MediaSessionService`. The service owns ExoPlayer, audio focus, current position, repeat/shuffle and the prepared queue. Its data source resolves YouTube media at open time, reads staged private files or opens validated HTTPS catalog audio. Resolutions run on the loader thread, not the UI thread. Signed media addresses are temporary and are excluded from queue state and logs.

The bridge uses track metadata and IDs. `src/native-player-core.mjs` prepares the selected item first and inserts later items progressively. Existing IndexedDB audio is copied atomically in bounded chunks to native private storage; originals remain intact. Request generations prevent stale preparation from modifying a replacement queue. Android does not run a parallel WebView audio player.

State events let a recreated Activity observe ongoing playback without resetting the queue. External media controllers receive transport controls but cannot inject arbitrary URIs or queues. `playing` represents play intent while buffering; use `buffering` and decoded position to verify actual progress. Force-stop and OS process death stop playback; persistence across process death is not implemented.

## Boundaries to preserve

- Validate external URLs, paths and metadata before they reach subprocesses or data sources.
- Bound file sizes, queues, concurrency, retries, elapsed time and output. Never turn a terminal upstream refusal into an infinite retry loop.
- Keep private environment values and signing files out of bundles, source archives and logs.
- Preserve library data on failure, cancellation and upgrade.
- Separate successful deterministic app tests from live upstream acceptance. Current YouTube refusals remain unresolved.

See [Android details](android.md), [deployment](../DEPLOYMENT.md), [contributor checks](../CONTRIBUTING.md) and [current release evidence](android-release-1.2.md).
