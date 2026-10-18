# Single-app conversion and stability

Historical design and verification record. The Android architecture supersedes the web-only deployment assumption below; see [the current architecture](architecture.md), [README](../README.md) and [1.2 release notes](android-release-1.2.md).

Sonora will run its UI, search, playlist lookup, downloader and FFmpeg converter in one Next.js deployment. Existing IndexedDB tracks and playlists remain compatible. The user requires free services only; no paid providers or paid trials may be introduced.

## Acceptance criteria

- No request depends on a separate Render service. Linux conversion tools are installed during build and traced into Node route bundles.
- Downloads stream progress and bounded audio chunks from the same origin, with cancellation, a deadline below Vercel's 300-second function budget, and cleanup of child processes and temporary files.
- Invalid URLs/formats, live/overlong videos, upstream rejection and interrupted transfers produce actionable errors, never a corrupt saved track.
- Closing a dialog keeps the active task available; cancel is explicit. Saved playlist progress survives cancellation and retry skips existing tracks.
- One audio element per mounted app; metadata/favorite changes do not restart playback. Imports have metadata deadlines and always leave the busy state.
- Storage and catalog errors have visible recovery states. Dialogs support keyboard focus; mobile controls remain reachable.

## Boundaries and validation

Conversion is bounded work within one HTTP request, not a persistent background job. It requires the tab to stay open. YouTube hosting-IP restrictions remain an upstream dependency. No deployment, account changes, or deletion of existing user data is included.

Implement and verify in order: bundled tools and process lifecycle; streaming API and client; playback/import/storage fixes; task UX and browser regression checks; deployment documentation. Use Node's test runner for process/protocol tests and Playwright for critical user flows, then a production build and local native conversion smoke test.

## Verification — 2026-09-05

- The original browser failures were reproduced before the fixes: searching allocated 20 additional Audio objects; liking a playing track changed its source; dismissing progress cancelled the download.
- `npm test`: 18 passing tests covering validation, split UTF-8 titles, process timeout/cancellation, stream integrity, native MP3/M4A/Opus encoding/decoding, same-origin route integration and temporary-file cleanup.
- Production browser coverage: 13 cases covering the original regressions, malformed imports, complete/incomplete download streams, persistence after reload, partially cancelled playlists, storage failure recovery, and first offline startup/playback. Layouts were inspected at 320, 768 and 1440 pixels.
- `npm run build`: passes with Next.js 16.3.4. Traced API bundles contain yt-dlp and FFmpeg and measure about 116.4 MiB each before Vercel packaging.
- Live smoke test: the real extractor fetched a public 19-second video's metadata; the new POST route downloaded and converted it to a 457,388-byte MP3, which FFmpeg decoded successfully. This was a local network test, not a Vercel deployment test.
- Dependency installation audit: zero reported vulnerabilities after the Next.js/PostCSS updates.
- Read-only review identified and fixed split UTF-8 decoding of child output and an inaccurate error when yt-dlp skips a source file.

The initial implementation did not deploy or change external services. The subsequent hosted deployment and its remaining upstream blocker are recorded in [vercel-launch.md](./vercel-launch.md). Real-device background suspension still cannot be established by these browser tests.
