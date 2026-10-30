# Android 1.3.0 — 2026-10-26

VersionCode 6. This update includes public/unlisted YouTube playlist import beyond 100 songs, playlist and artist discovery, artist-only play/shuffle/repeat, source-ordered retry, and measured Android search/replay improvements. It retains Android 10+, both ARM installers, native background playback, existing audio conversion formats/quality, and the existing release signing configuration.

Fresh 24-result music searches measured 1.0–1.7 seconds in the final native path versus 6.2–12.9 seconds in the baseline on the same emulator/connection. Fully warm metadata queries measured 6–8 ms in a follow-up. Reopening one successful stream fell from about 39 seconds to about 1.3 seconds. See [full performance evidence and rejected experiments](performance-1.3.md).

First playback still includes upstream extraction and JavaScript processing and can remain slow or be refused by YouTube. Private playlists and account sign-in are outside this release. Artist search identifies channels, not verified artist ownership. Android playlist downloads continue the current song in the background and resume remaining songs after the app returns.

The debug APK updated the existing Android 16 x86_64 emulator installation without removing its data. Twenty-two deterministic instrumentation checks, 11 JVM tests, and 45 Node tests passed during preparation. Live search and streaming measurements are reported separately from deterministic tests. Physical ARM devices, Bluetooth hardware, and phone-call interruptions remain unverified.

The release process verifies both ARM APK signatures against the previous public certificate, packages matching GPL-3.0 application source and checksums, stages the complete existing website, and checks the download paths before production promotion. Install the update over the existing app; do not uninstall to update.

The website framework is updated to Next.js 16.4.1 after the release audit identified affected dependency ranges in the existing lockfile. This follows the patched-version guidance for [image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw) and [cache-function handling](https://github.com/advisories/GHSA-673q-mjm6-r5xr). This records dependency remediation; it is not a claim that this application was exploited. The updated production dependency audit reports zero known vulnerabilities.
