# Third-party licenses and source

Sonora's own application code is GPL-3.0-only; see [LICENSE](LICENSE). The components below retain their respective copyrights and licenses. This list describes the main components; installed dependency packages also contain their notices and transitive dependency licenses.

| Component | License | Source / build information |
| --- | --- | --- |
| youtubedl-android library and FFmpeg wrapper 0.18.1 | GPL-3.0 | [Pinned source](https://github.com/yausername/youtubedl-android/tree/0.18.1), [license](https://github.com/yausername/youtubedl-android/blob/0.18.1/LICENSE), [FFmpeg build](https://github.com/yausername/youtubedl-android/blob/0.18.1/BUILD_FFMPEG.md), [Python build](https://github.com/yausername/youtubedl-android/blob/0.18.1/BUILD_PYTHON.md) |
| Android yt-dlp 2026.10.10.233141 | Unlicense; bundled dependencies have separate licenses | [Official release](https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/tag/2026.10.10.233141), [source and notices](https://github.com/yt-dlp/yt-dlp), [EJS source](https://github.com/yt-dlp/ejs) |
| Server yt-dlp 2026.08.19 | Unlicense; standalone distributions include dependency notices | [Pinned source](https://github.com/yt-dlp/yt-dlp/tree/2026.08.19), [release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19) |
| FFmpeg / ffmpeg-static | FFmpeg build-dependent LGPL/GPL terms; ffmpeg-static package GPL-3.0-or-later | [ffmpeg-static source, binary releases and licensing notes](https://github.com/eugeneware/ffmpeg-static), [FFmpeg source](https://ffmpeg.org/download.html), [FFmpeg legal information](https://ffmpeg.org/legal.html) |
| AndroidX Media3 1.11.1 | Apache-2.0 | [Pinned source](https://github.com/androidx/media/tree/1.11.1), [license copy](public/licenses/Apache-2.0.txt) |
| Capacitor | MIT | [Source](https://github.com/ionic-team/capacitor) |
| React / Next.js | MIT | [React](https://github.com/facebook/react), [Next.js](https://github.com/vercel/next.js) |
| idb / jsmediatags / react-youtube | MIT | [idb](https://github.com/jakearchibald/idb), [jsmediatags](https://github.com/aadsm/jsmediatags), [react-youtube](https://github.com/tjallingt/react-youtube) |
| Lucide | ISC | [Source and license](https://github.com/lucide-icons/lucide) |
| Gradle wrapper | Apache-2.0 | [Gradle 8.14 source](https://github.com/gradle/gradle/tree/v8.14.0) |

The Android runtime bundle also supplies Python, QuickJS, the library's original yt-dlp fallback and native dependencies. Follow the pinned upstream build information above and retain the notices shipped with those tools. Dependency versions are declared in `package-lock.json` and the Android Gradle files; engine versions and hashes are in `scripts/setup-media.mjs` and `scripts/setup-android-media.mjs`.

## Distributing builds

Keep license notices with distributed APKs, and provide recipients the corresponding application and covered dependency source/build information for the exact binaries being distributed. A source link to a moving `main` branch is not a reproducible release: identify the commit/tag and retain the matching sources, patches and build instructions. Signing keys, service credentials and users' music must not be included.

`npm run package:android` produces application source and notices alongside the APKs. That application archive does not bundle every third-party native dependency's corresponding source. Redistributors must also arrange the applicable upstream sources and build materials for their exact bundled versions; the archive alone is not a claim of complete distribution compliance.

Music, third-party artwork and service content are not licensed by this repository's GPL. Contributors should use generated or redistributable fixtures and identify their source/license.
