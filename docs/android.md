# Sonora for Android

Sonora now bundles its existing React interface in Capacitor and performs YouTube search, playlist lookup, audio download and conversion on the Android device. There is no hosted worker, paid download API, account requirement or computer that needs to stay on. The Vercel website remains a separate browser installation; its library does not automatically transfer into the Android app.

## Install and use

Requires Android 10 or newer and an up-to-date Android System WebView (Chrome 110 or newer). The download page offers complete **arm64-v8a** (about 73 MB) and **armeabi-v7a** (about 66 MB) installers. Choose 64-bit ARM for most current phones; if Android rejects it as incompatible, try 32-bit ARM. A larger universal APK and an x86_64 APK are also generated locally for validation, but are not served by the website. A 64-bit processor can run a 32-bit Android OS, so the phone model alone is not a reliable installer selector. Android versions below 10 and 32-bit Intel are not supported. Install the signed APK through Android's normal installer, then open Sonora. A Play Store account is not required for direct installation.

Tap **Download**, paste a YouTube video or playlist URL, choose MP3, M4A or Opus, and save. Finished tracks appear in **Library** and **Offline**. The optional recovery copy is written to **Downloads/Sonora** without broad storage permissions. Use content you own or have permission to save.

Android playback now runs in a Media3 mediaPlayback foreground service, independently of the Activity/WebView. Prepared queue items keep playing with the screen off and when switching apps; Android media controls provide pause, seek and skip. Reopening attaches to the existing player without restarting it. Force-stop and OS process death stop playback; process-death queue restoration is not implemented. Existing Blob-backed tracks are copied in bounded chunks into private native files on first playback; originals remain in IndexedDB, so those tracks use additional storage. The selected track starts first while remaining queue copies prepare. If the Activity is destroyed during preparation, only already prepared items are guaranteed to remain queued. Native queues are bounded to 500 tracks and imported playback copies to 256 MiB each.

YouTube playback uses an unofficial on-device stream resolver and does not wait for a complete-file download or conversion. This is outside the official embedded-player API. Live verification of the reported Julia Boutros “Moqawem” upload and the short public test clip still returned YouTube bot-check refusals on the test connection; neither streaming nor downloading those clips is claimed fixed. The native player itself passed a separate real HTTPS Jamendo stream test with screen-off playback and no saved audio Blob. Search metadata caches up to 24 queries for two minutes; an emulator cold/warm query measured about 12.18 seconds/51 milliseconds, respectively. Fresh searches remain network-dependent.

The current track continues downloading and converting in an Android foreground service when you switch apps or lock the phone. Its notification offers Cancel. Reopen Sonora to finish saving; remaining playlist tracks wait for the app to return to the foreground. Activity recreation keeps the native job and offers recovery through download Details. Force-stopping the app, removing it from Recents, an OS process kill, or exceeding the task deadline can interrupt work; retry keeps completed tracks. Notification permission is optional: denying it does not block downloads, although Android may show the service only in its active-apps panel. Closing just the download dialog continues the job. Android Back closes the current dialog/player/view before minimizing the app, and brings up an active download instead of unexpectedly leaving it.

The local limits are one conversion at a time, two lookups, 100 playlist entries, 30 minutes per video, 96 MiB source, 64 MiB finished audio, 160 MiB temporary files, and 260 seconds per conversion. These are ceilings, not promises that every video or connection will succeed. YouTube can refuse individual connections, remove videos, or change its extraction behavior; future changes may require an updated APK. No proxy or paid fallback is used.

## iPhone

The website supports file imports, playlists and offline playback on iPhone. A working native iPhone YouTube downloader has **not** been implemented or verified. Vercel's YouTube requests were refused in live testing; a website alone does not gain Android's native download capability.

## Build

Use Node 22+, a full JDK 21 or 24 (including `javac`), Android SDK platform 36 and accepted SDK licenses. Install dependencies with `npm ci`. Set `ANDROID_HOME` to your SDK or create ignored `android/local.properties` with `sdk.dir=/absolute/sdk/path`.

```sh
npm run build:mobile
cd android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
```

Version **1.2.2** uses Android versionCode **5**. Updates use the existing signing key and preserve the private library; do not uninstall to update.

The build pins Capacitor Android/core 8.5.1, CLI 8.4.3, Gradle 8.14, AGP 8.13.0, and `youtubedl-android` library/FFmpeg 0.18.1. The native library supplies Python, QuickJS and FFmpeg. Sonora runs the official yt-dlp nightly 2026.10.10.233141 Python zipimport release, including matching EJS challenge scripts and the upstream default-client fix in PR #17805. Android playback uses Media3 ExoPlayer/session 1.11.1. `scripts/setup-android-media.mjs` downloads and SHA-256 verifies it before Gradle builds; a versioned, atomic install replaces the old engine on app upgrades. The native library’s original 2025.11.12 fallback remains bundled but is not selected by Sonora. The native library bundle is intentionally separate from the Linux executable used by Next.js. The mobile bundle copies only public client configuration; server YouTube credentials are not included.

For signed releases, create your own keystore and an ignored `android/keystore.properties` with `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. Run `./gradlew :app:assembleRelease`. A universal APK and smaller APKs split by architecture are generated under `android/app/build/outputs/apk/release/`. Keep the signing key and passwords private and backed up: updates must use the same key. The maintainer's signing key is not distributed. A contributor's debug or differently signed release cannot update a maintainer-signed installation; use an emulator or a separate device without uninstalling your music library.

## Verification

Instrumentation tests in `android/app/src/androidTest` perform real public-video conversions, validate audio duration, reject deceptive URLs/path traversal, exercise cancellation of child processes, and enforce timeout/output limits. Install the debug APK matching your emulator plus `app-debug-androidTest.apk`, then run:

```sh
adb shell am instrument -w app.sonora.music.test/androidx.test.runner.AndroidJUnitRunner
```

`node tests/android-ui.mjs` attaches to an existing debug APK in an emulator and verifies a real MP3 download, Downloads export, IndexedDB storage, offline reload/playback and Android Back. It refuses physical-device serials because it temporarily changes emulator networking. Set `ADB` and `ANDROID_SERIAL` if needed. `SONORA_DENY_NOTIFICATIONS=1 node tests/android-ui.mjs` also verifies the notification-denied path after the permission has been requested once. `node tests/android-recovery.mjs` enables and restores the emulator’s “Don’t keep activities” setting and verifies same-job reattachment after Activity destruction. `node tests/android-playlist.mjs` uses a deterministic playlist lookup with real native downloads to verify foreground waiting and the actual notification Cancel action. The test removes only its public test clip from the emulator library to avoid a duplicate-download skip. Screenshots go to ignored `mobile-artifacts/`.

Historical version 1.1.0 verification on an Android 16 x86_64 emulator: seven instrumentation tests, including real MP3, M4A and Opus conversion, engine upgrade, cancellation including subprocess children, and timeout/output bounds. Separate WebView runs verified background download, recovery-file export, offline library/playback, Back navigation, notification permission denial, Activity destruction/reattachment, playlist foreground waiting, and the notification's Cancel action. Signed release APKs were built for arm64, arm32 and x86_64; package version and continuity with the previous signing certificate were verified. A physical arm64 phone, including the reported Samsung A35, has not yet been tested. Separate checks passed 19 Node tests and 17 production-browser regressions; the complete dependency audit reported zero known vulnerabilities at verification time.

Package a signed release with `npm run package:android`. This creates installer Build Output, a SHA-256 manifest, license notices and application source under ignored `mobile-artifacts/android-installer/`. Add `-- --public` to also prepare ignored `public/downloads/` for the complete website deployment from the repository root. The public `/android` link redirects to that installer without sign-in. Future website deployments must prepare these release assets again; CI does not deploy. Installer-only Build Output can still be deployed as a separate preview, but must never replace the production music website.

New native tests cover playback queues, foreground registration, restricted controllers, rapid selection/insertion, staging and bounded retries. `node tests/android-background.mjs` verifies native screen-off playback, queue advancement after Activity destruction, system media controls and a real HTTPS catalog stream. Supply a Jamendo metadata fixture using `SONORA_STREAM_FIXTURE`; the default local fixture is `/tmp/sonora-live-stream.json` and is not distributed. `node tests/android-youtube-probe.mjs` records actual live streaming/download outcomes and cold/warm search timings; a refused upstream request is recorded as a failure, never a passing download. Existing live YouTube tests require a connection YouTube accepts and may fail independently of local deterministic checks.

### Background stream fixture

Put `adb` on your `PATH`, or set `ADB` to its absolute path. Use a disposable emulator with the debug APK installed. For the HTTPS part of the background test, create a local JSON fixture containing a real, currently playable Jamendo audio URL and matching metadata:

```json
{
  "id": "jamendo-test-track",
  "title": "Your test track",
  "artist": "Artist",
  "source": "jamendo",
  "audio": "https://YOUR-ACTUAL-HOST.storage.jamendo.com/YOUR-ACTUAL-AUDIO-PATH",
  "duration": 120
}
```

The URL above is a placeholder: replace it with the actual HTTPS `audio` address returned by Jamendo for a track you may use. Do not commit account data or signed media addresses. From the repository root, run `SONORA_STREAM_FIXTURE=/absolute/path/fixture.json node tests/android-background.mjs`. The test waits for decoded progress before measuring screen-off continuation. This is a live network check, separate from CI.

## Dependencies and source

Sonora's application source is published under [GPL-3.0-only](../LICENSE), as approved by the project owner. The Android downloader library is GPL-3.0 licensed; its original license is included in `public/licenses/GPL-3.0.txt`. Third-party components retain their original licenses. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for distribution requirements and dependency source/build information.

- [youtubedl-android 0.18.1 source and build scripts](https://github.com/yausername/youtubedl-android/tree/0.18.1)
- [Active Android yt-dlp build](https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/tag/2026.10.10.233141), [upstream client fix](https://github.com/yt-dlp/yt-dlp/pull/17805), [EJS runtime requirements](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [original library-bundled release](https://github.com/yt-dlp/yt-dlp/tree/2025.11.12), [Android lazy build](https://github.com/xibr/ytdlp-lazy)
- [FFmpeg build instructions](https://github.com/yausername/youtubedl-android/blob/0.18.1/BUILD_FFMPEG.md), [Python build instructions](https://github.com/yausername/youtubedl-android/blob/0.18.1/BUILD_PYTHON.md)
- [Termux dependency build recipes](https://github.com/termux/termux-packages)
- [Media3 source](https://github.com/androidx/media/tree/1.11.1), Apache-2.0
- [Capacitor source](https://github.com/ionic-team/capacitor/tree/8.5.1), MIT

Keep license notices and corresponding source/build information alongside any distributed APK. `scripts/package-android-source.py` creates a copy of the application source, including the license and contributor documentation, without credentials, user data, signing keys, caches or APKs. It does not bundle third-party native dependency source; redistributors must provide the applicable materials for their exact bundled versions too.
