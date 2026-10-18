# Android 1.2.0 — 2026-10-18

VersionCode 3, using the existing signing key. Install over the previous version to preserve the library. Updating the website does not update an APK already installed on a phone.

## Verified changes

- Media3 1.11.1 owns Android audio and the queue in a mediaPlayback foreground service. Prepared items continue with the screen off and without the Activity/WebView. Android media controls publish title/artist and support pause, seek and skip. Reopening observes ongoing playback.
- The selected track starts first; remaining audio is prepared progressively. Existing IndexedDB files are retained while private native copies are staged atomically in 256 KiB chunks. Interrupted staging cannot publish a partial track. Playback copies are limited to 256 MiB each; queues to 500 tracks. Initial-copy preparation can be interrupted by Activity destruction; only prepared items are guaranteed in the native queue.
- Native YouTube streaming resolves an audio address on-device rather than waiting for a full download or conversion. Signed addresses stay out of queue state and logs. Native transports retry at most twice; resolver refusals are terminal until the user retries.
- The verified official extraction build is 2026.10.10.233141, with SHA-256 `f40b6a9e4c5786360953911cab5d2f87507626b8fb7bfee3f8f1c2e5cf341fae`. It includes upstream default-client maintenance from PR #17805. Engine installation is serialized across concurrent search/download/player instances.
- Search caches 24 metadata queries for two minutes and coalesces concurrent requests with independent cancellation. A cold/warm emulator query returned the same 24 results in 12.18 seconds/51 milliseconds. This is an emulator measurement, not an A35 benchmark or a one-second cold-search guarantee.
- Download failures identify upstream refusal, unavailable media, duration/size limits, storage, TLS, format changes and corrupt output. Dismissed recovery notices stay dismissed; a kept job can be explicitly cancelled so it cannot remain invisible and block a new task. Completed tracks remain saved.

## Unresolved live YouTube limitation

Both native streaming and M4A download of Julia Boutros “Moqawem” (`rjiYnWxoqM0`) were refused by YouTube's bot checks. A second short public clip (`jNQXAC9IVRw`) was refused too. Search succeeded. The newer engine does not establish a fix for these refusals, and this release does not claim otherwise. The unofficial resolver is outside official embedded-player support and remains subject to YouTube's restrictions and changes. No user credentials, proxy, paid service or external conversion worker was used.

## Verification

- 25 Node tests, 18 local production-browser checks and 11 native JVM tests passed.
- 18 deterministic Android instrumentation tests passed: service registration/foreground operation, local queue advance, transport-only controllers, rapid replacement, generation-fenced insertion, extractor validation/cache/cancellation, concurrent engine installation, subprocess cancellation and bounds.
- Real WebView/native checks passed: local screen-off playback, automatic queue advance after Activity/WebView destruction, state restoration, Android media controls and seek, and a real HTTPS Jamendo stream with screen-off progress and no saved audio Blob.
- Complete npm dependency audit: zero known vulnerabilities at preparation time.

Legacy real YouTube download tests are upstream-dependent and are not counted as passing in this release. Physical Samsung A35 playback, Bluetooth hardware and phone-call interruption have not been tested. The native player configures Android audio focus and becoming-noisy handling; no claim is made that it survives force-stop or OS process death.

See [Android instructions](android.md) for build/test commands and [deployment records](vercel-launch.md) for published artifact checksums and URLs.
