<p align="center">
  <img src="public/favicon.svg" width="72" height="72" alt="Sonora logo">
</p>

# Sonora

**Your music, on your device.** An open-source Android music app and web player with a shared React interface, an offline library, and native Android background playback.

[![CI](https://github.com/Medgleiguem/sonora-music-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/Medgleiguem/sonora-music-hub/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)
[![Android 10+](https://img.shields.io/badge/Android-10%2B-3ddc84.svg)](docs/android.md)

[Download Android](https://sonora-music-hub-six.vercel.app/android) · [Try the web player](https://sonora-music-hub-six.vercel.app) · [Build from source](#build-the-android-app) · [Contribute](CONTRIBUTING.md) · [Report a bug](https://github.com/Medgleiguem/sonora-music-hub/issues/new/choose)

## What you can do

- Import audio files and keep a device-local library with playlists and favorites.
- Listen offline to saved tracks, with queue controls, repeat, shuffle and seeking.
- Keep Android audio playing when the screen turns off or you switch apps. Media3 owns playback and prepared queue items independently of the WebView.
- Discover music through YouTube search and an optional Jamendo catalog.
- Attempt on-device YouTube audio streaming and MP3, M4A or Opus downloads, with progress, cancellation and recovery controls.
- Use the responsive web player as an installable PWA, including local imports and offline playback.

**Current status: active development, version 1.2.1.** YouTube streaming and downloading are experimental and remain unreliable. In the latest emulator tests, YouTube refused both Julia Boutros “Moqawem” and a second public clip. Cold search took about 12 seconds; the same cached query took 51 ms. These results are documented limitations, not a claim that downloads or first searches are fixed. Contributions that improve reproducibility, reliability and performance are especially welcome.

## Platform support

| Capability | Android app | Web / iPhone browser |
| --- | --- | --- |
| Local imports, playlists, favorites, offline library | Supported | Supported; browser storage rules apply |
| Background audio and Android media controls | Native Media3 service | Depends on browser and operating system |
| YouTube discovery | On-device lookup | Server Data API or yt-dlp lookup |
| YouTube audio streaming / conversion | Experimental on-device resolver | Official visible player; local Node conversion on compatible hosts |
| Conversion on the public Vercel demo | Uses the separate Android app | Intentionally unavailable; import files instead |

There is no account or cloud library. Browser and Android installations have separate libraries. Sonora is not affiliated with YouTube, Spotify or Jamendo. Only download or redistribute content you have the right to use.

## Start the web app

Requirements: **Node.js 22+**, **npm 10+**, and Linux x64/arm64, macOS or Windows x64. Use the Node version in [.nvmrc](.nvmrc) when contributing.

```sh
git clone https://github.com/Medgleiguem/sonora-music-hub.git
cd sonora-music-hub
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). In Windows PowerShell, use `Copy-Item .env.example .env.local` for the copy step. All configuration is optional for local imports and playback.

FFmpeg installs with npm. The first dev/build command downloads a pinned, SHA-256-verified yt-dlp executable from its official release. Install scripts and access to npm and GitHub release assets must be available. The standalone server executable includes Python; Node supplies its JavaScript runtime.

For production:

```sh
npm run build
npm start
```

See [deployment guidance](DEPLOYMENT.md) before hosting a public instance. A successful build does not guarantee that YouTube accepts the host's connection.

## Build the Android app

Requires **Android 10+** to run. To build, install a full **JDK 21**, **Android SDK platform 36**, and **SDK build tools 36.0.0**, and accept the SDK licenses. Set `ANDROID_HOME` or configure `sdk.dir` in the ignored `android/local.properties` file. Run these commands after `npm ci`:

```sh
npm run build:mobile
cd android
./gradlew :app:assembleDebug
```

On Windows, use `gradlew.bat`. Debug APKs are produced in `android/app/build/outputs/apk/debug/`: choose **arm64-v8a** for most modern phones, **armeabi-v7a** for supported older devices, or **x86_64** for an emulator. With an emulator connected:

```sh
adb install -r app/build/outputs/apk/debug/app-x86_64-debug.apk
```

Contributor builds use a local debug key. They cannot update a maintainer-signed installation; use an emulator or a separate device to avoid uninstalling an app containing your music. Release keys are never included in this repository. The [public Android installer](https://sonora-music-hub-six.vercel.app/android) provides maintainer-signed APKs, checksums and application source without a Vercel login. Building from source also requires no Vercel account.

[Android documentation](docs/android.md) covers signing, architecture splits, playback limits, device tests and dependency sources.

## Configuration

Copy [.env.example](.env.example); keep real values out of Git.

| Variable | Purpose |
| --- | --- |
| `YOUTUBE_API_KEY` | Optional server-only YouTube Data API key for web search; otherwise yt-dlp handles lookup |
| `YOUTUBE_REGION` / `NEXT_PUBLIC_YOUTUBE_REGION` | Two-letter discovery region, default `US` |
| `NEXT_PUBLIC_YOUTUBE_ENABLED` | Set `false` to hide YouTube discovery |
| `NEXT_PUBLIC_JAMENDO_CLIENT_ID` | Optional public client ID for independent music discovery |
| `PLAYLIST_MAX_ITEMS` | Server playlist lookup cap, 1–100; default 100 |
| `YT_DLP_PATH` / `FFMPEG_PATH` | Optional absolute server executable overrides |
| `YT_DLP_PROXY` / `YT_DLP_COOKIES_PATH` | Optional private server-side configuration; neither is required or bundled with Android |

`NEXT_PUBLIC_` values are included in client bundles. Never use that prefix for private API keys, cookies or credentials. Changing mobile public configuration requires rebuilding the app.

## Development and tests

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm test` | Run Node tests, including real FFmpeg encode/decode checks |
| `npm run build` | Build the production web app |
| `npm run test:browser` | Run Playwright browser regressions |
| `npm run build:mobile` | Bundle the Android UI and sync Capacitor |
| `npm run build:android` | Build the mobile bundle and Android debug APKs |
| `npm run package:android` | Package an already signed release and source archive |

```sh
npm test
npx playwright install chromium
npm run build
PLAYWRIGHT_PRODUCTION=1 npm run test:browser
```

The last command uses POSIX environment syntax; in PowerShell, set `$env:PLAYWRIGHT_PRODUCTION = '1'` before running the test command. Browser tests use generated audio and stubbed upstream responses. They verify app behavior without a YouTube account, but **do not prove live YouTube download success**. Separate Android live probes report actual upstream failures.

CI runs Node tests, a production build, browser regressions, dependency auditing, and Android JVM tests/debug compilation without signing keys or production secrets. See [CONTRIBUTING.md](CONTRIBUTING.md) for focused checks and the PR process.

## How it fits together

| Path | Responsibility |
| --- | --- |
| `src/` | Shared React interface, IndexedDB library and native bridge clients |
| `app/` | Next.js pages and same-origin search/download routes |
| `lib/` | Server input validation, subprocess control and media conversion |
| `android/` | Capacitor project, Media3 playback service and on-device extraction |
| `mobile/`, `scripts/` | Mobile entry point, pinned tool setup and release packaging |
| `tests/` | Node, Playwright and emulator workflows |
| `docs/` | Architecture, Android build notes and release evidence |

Read the [architecture overview](docs/architecture.md), [1.2.1 release notes](docs/android-release-1.2.1.md) and [changelog](CHANGELOG.md) for design details and current limits.

## Storage and known limits

Audio and library metadata are stored on the current device in IndexedDB. Android stages private native playback copies while preserving the originals, so first playback uses extra storage. Only prepared items are guaranteed to continue if the Activity is destroyed during staging. Force-stop or OS process death stops playback; process-death queue restoration is not implemented.

Native queues contain at most 500 items; playback copies are capped at 256 MiB per file. Conversion accepts finished videos up to 30 minutes, with a 96 MiB source cap, 64 MiB output cap and 260-second deadline. Playlist downloads process up to 100 entries sequentially. These limits do not guarantee every video will work.

Clearing app/site data or uninstalling can delete your library. Browser storage can also be evicted. Keep independent copies of music you want to preserve. No cross-device sync is implemented. Physical Samsung A35, Bluetooth hardware and phone-call interruption remain unverified in the current release.

## Contribute

Bug reports, accessibility improvements, documentation, tests and focused fixes are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), browse [open issues](https://github.com/Medgleiguem/sonora-music-hub/issues), or propose an improvement with the issue templates. Agree on larger changes before implementation so the work fits the project.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately through the [security policy](SECURITY.md).

Created by **[Med Gleiguem](https://github.com/Medgleiguem)**, with contributions welcome from the community.

## License and acknowledgments

Sonora's application code is licensed under **[GNU GPL version 3 only](LICENSE)**. Contributions are accepted under the same license; no contributor license agreement is required.

Built with React, Next.js, Capacitor, AndroidX Media3, yt-dlp, youtubedl-android, FFmpeg, idb, jsmediatags and Lucide. Third-party code retains its original licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for licenses and source/build references, especially when distributing APKs.
