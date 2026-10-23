# Changelog

## 1.2.2 — 2026-10-18

- Offer smaller, clearly labelled 32-bit and 64-bit ARM installers for Android 10 or newer.
- Refuse packaging a release that is missing either supported ARM installer.
- Preserve existing app features, audio quality and update signing; each installer contains only its matching native architecture.

## 1.2.1 — 2026-10-18

- Add “Made by Med Gleiguem” to the mobile bottom bar, desktop sidebar and installer.
- Publish the application source under GPL-3.0-only.
- Add contributor setup, security reporting, issue/PR templates and automated web/Android checks.

## 1.2.0 — 2026-10-18

### Added

- Native Android background playback with Media3, system media controls and queue advancement independent of the Activity/WebView.
- Progressive staging of existing saved audio for native playback and reattachment when the app screen reopens.
- Experimental on-device YouTube stream resolution without a full-file download.

### Changed

- Cache and coalesce repeated native search lookups; a test query measured 12.18 seconds cold and 51 ms warm on an emulator.
- Pin and verify the Android extraction engine at 2026.10.10.233141.
- Bound playback retries and improve extraction/storage failure reporting and dismissed-download recovery.

### Known limitations

- YouTube refused streaming and downloading the reported “Moqawem” upload and a second short public video on the test connection. These failures remain unresolved.
- Physical A35, Bluetooth hardware and phone-call interruption are unverified. OS process-death restoration is not implemented.

See [the complete release evidence](docs/android-release-1.2.md).

## 1.1.0 — 2026-10-18

- Improve native download lifecycle, foreground playlist waiting, recovery and notification cancellation.
- Improve mobile layout, storage recovery and large-library rendering.

See [the historical release notes](docs/android-release-1.1.md). Earlier deployment records are retained in [docs/vercel-launch.md](docs/vercel-launch.md).
