# Contributing to Sonora

We welcome code, reproducible bug reports, documentation, accessibility reviews and device testing. The project is maintained by [@Medgleiguem](https://github.com/Medgleiguem); all contributions follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Pick a useful change

Search [existing issues](https://github.com/Medgleiguem/sonora-music-hub/issues) before opening a new one. For substantial features or architectural changes, describe the problem and proposed approach in an issue first. Small documentation fixes can go straight to a pull request.

Current priorities:

- Reproduce and diagnose YouTube refusals without exposing credentials or silently replacing the requested song.
- Measure and reduce cold-search and first-play latency; report before/after timings and cache state.
- Test background playback, audio focus, Bluetooth and interruptions on physical Android devices.
- Improve accessibility, small-phone layouts, storage recovery and contributor documentation.

Do not add paid services, new accounts, proxies or cloud workers as required dependencies without agreement. Prefer a measured fix within the existing architecture. A successful mock or a cached search is not evidence of live download success or fast cold search.

## Set up your workspace

1. Fork the repository and clone your fork.
2. Install Node 22+ and npm 10+; `.nvmrc` specifies the contributor Node version.
3. Run `npm ci`, copy `.env.example` to `.env.local`, and run `npm run dev`.
4. Create a focused branch, such as `fix/download-recovery` or `docs/android-setup`.

Local imports, unit tests and browser regressions do not need credentials. Install scripts must be enabled for FFmpeg. The first web build/dev run downloads the pinned server yt-dlp engine. See the [README](README.md) for platform prerequisites and optional configuration.

Android contributors also need JDK 21, Android SDK platform 36 and build tools 36.0.0. Set `ANDROID_HOME`, accept the SDK licenses, and put `platform-tools` on your `PATH`. After installing npm dependencies:

```sh
npm run build:mobile
cd android
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest
```

Use `gradlew.bat` on Windows. `build:mobile` generates Capacitor assets and the Cordova compatibility project; build after syncing. The Gradle wrapper and native project sources are committed; generated assets, SDK paths, signing keys and downloaded engines are ignored.

## Make the change

- Follow the surrounding JavaScript/JSX or Java style; avoid unrelated formatting and refactors.
- Keep PRs focused and describe the user-visible behavior being changed.
- For behavioral fixes, add a regression that fails before the fix where practical. Exercise cancellation, stale async work and failure paths when relevant.
- Treat external URLs, filenames and metadata as untrusted. Preserve path, size, deadline and subprocess bounds.
- Preserve saved libraries. Never clear IndexedDB or replace the Android signing identity as an update strategy.
- Keep native playback independent of JavaScript; do not reintroduce a second WebView audio player on Android.
- Update documentation when commands, configuration or verified behavior change.

Do not introduce a new formatter, linter, test framework or dependency merely to match a personal preference. The project currently has no standalone lint or TypeScript check; do not describe them as passing checks.

## Verify your work

For shared UI or web behavior:

```sh
npm test
npx playwright install chromium
npm run build
PLAYWRIGHT_PRODUCTION=1 npm run test:browser
git diff --check
```

The environment assignment above uses POSIX syntax. PowerShell: `$env:PLAYWRIGHT_PRODUCTION = '1'`, then `npm run test:browser`. On Linux, Playwright may need system packages: `npx playwright install --with-deps chromium`. Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to select an existing compatible Chrome binary. Ensure port 3000 is free so the suite starts the intended production build.

For native changes, also run the targeted Gradle command above. Device behavior needs instrumentation or an emulator/physical-device check; compilation and JVM tests alone do not prove background playback works. [Android documentation](docs/android.md#verification) explains the suites. Live YouTube tests depend on upstream acceptance and are separate from deterministic CI checks.

Emulator scripts use `adb` on `PATH`, or an explicit `ADB` environment variable, and `ANDROID_SERIAL` (default `emulator-5554`). They intentionally refuse physical devices because they change emulator settings or networking. Use a disposable emulator library. `android-background.mjs` also needs a valid HTTPS Jamendo fixture; see [the fixture instructions](docs/android.md#background-stream-fixture).

Never commit `.env` files, cookies, API keys, signing material, private audio, APKs or generated build directories. Remove signed media URLs and credentials from logs, screenshots and traces before attaching them to an issue.

## Open a pull request

Push your branch to your fork and open a PR against `main`. Use the template to explain:

- The problem and resulting behavior, with a linked issue if one exists.
- Checks actually run and their results; name anything unverified.
- Device/OS details and screenshots for visible changes, using generated or redistributable media.
- Storage, permissions, dependency or license changes that reviewers should assess.

CI checks web tests/build/browser behavior and Android JVM tests/debug builds. It has read-only repository permissions, no release signing key, no production credentials and no deployment step. Fork PRs should not need secrets. Green CI does not establish live YouTube availability.

A maintainer reviews contributions before merging. Address review findings in the same PR and keep discussion focused on evidence and the change. No response-time guarantee is made. By submitting a contribution, you agree to license it under [GPL-3.0-only](LICENSE) and confirm you have the right to contribute it. No CLA is required.
