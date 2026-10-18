# Android 1.1.0 — 2026-10-18

Android versionCode 2 updates the existing application with the same signing key. Install over the previous APK to retain the private library.

## Changes

- Move the current native download into an Android foreground service so leaving the Activity does not cancel conversion. Reattach after Activity recreation, expose notification cancellation, and wait for foreground before starting another playlist track.
- Bundle SHA-256 verified yt-dlp 2026.08.19 with matching challenge scripts, replacing the old extraction engine on app upgrade.
- Preserve completed playlist tracks on cancellation, retain interrupted requests for retry, and show actionable download failures.
- Reduce initial library rendering to 60 tracks with more available on demand; searches still cover the complete library.
- Improve phone navigation, 48-pixel controls, small-screen dialogs, storage copy, progress semantics and Android home layout.
- Patch vulnerable dependencies, including Next.js 16.3.8. Audit at release preparation: zero known vulnerabilities.

## Evidence and limits

Nineteen Node tests and 17 production-browser checks passed. Seven Android instrumentation tests passed with real MP3/M4A/Opus conversions. Additional emulator checks covered downloads while backgrounded, export, offline reopen/playback, Android Back, notification denial, Activity recreation, foreground playlist waiting and the actual notification Cancel button.

The emulator used Android 16 x86_64. Physical Samsung A35 behavior remains unverified. A synthetic 1,000-track browser library showed faster input handling after rendering was bounded; those timings are not physical-phone benchmarks. Background support applies to the current track, with later playlist items waiting for foreground. Force-stop and OS process death are not resumable native jobs. YouTube can reject connections or change extraction behavior.

Signed arm64 APK: 66,142,242 bytes; SHA-256 `47591e2000388c90369a9ad1e350893d4fb1a89a77d2f3f966446cec29dac06a`.

Signed arm32 APK: 59,489,430 bytes; SHA-256 `92abaa973469a248f18f61b96894b15d8838001e884e2b1dfc5ee14c0744d385`.

The release installer includes a generated checksum manifest and corresponding application source without signing keys, credentials or generated engine binaries. Keep installer/source previews protected. See [Android build and verification](android.md) and [deployment evidence](vercel-launch.md).
