# Free mobile download implementation

The user permits an architecture change, requires no paid services and no computer left running, and needs Android first plus iPhone access. Keep the shared Sonora UI and browser library. Add an Android app which bundles that UI and performs YouTube extraction and FFmpeg conversion on the device. The website remains available on both mobile platforms. Native iOS conversion is not established by Android tests and must remain explicitly unresolved until verified.

1. Prove an Android-native downloader can fetch and convert a real short public video in an emulator using the device network. Use the maintained youtubedl-android library (Python, QuickJS, FFmpeg). No remote worker or public converter API.
2. Bundle the existing React UI into Capacitor; add a narrow native bridge for canonical YouTube search, playlist lookup, download, cancellation, and release of temporary files. Do not expose arbitrary executable arguments or arbitrary URLs. Bound time, output, file sizes, concurrency, and disk use.
3. Integrate native progress and finished audio into the existing validated storage flow. Keep web behavior intact. Verify native offline startup, playback, cancel/retry and real conversion, plus existing web regression tests.
4. Build a distributable Android APK with reproducible instructions and license notices. Provide the tested download artifact and clearly document the iPhone limitation. Keep new services and purchases at zero.

Sources: https://github.com/yausername/youtubedl-android ; https://capacitorjs.com/docs/plugins/android ; https://capacitorjs.com/docs/android .

Free-hosted research: Vercel extraction failed in two regions with verified PO tokens. The current Invidious registry lists no API-enabled public instance. The current Cobalt directory's working YouTube instances require instance authentication; no unauthenticated service was verified. A regular browser cannot replace native network access just by moving FFmpeg into WebAssembly.
