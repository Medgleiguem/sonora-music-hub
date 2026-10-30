# YouTube Mix import fix

The reported `RDuSiHqxgE2d0` link is a video-seeded Mix. YouTube rejects its `/playlist?list=…` page with “This playlist type is unviewable.” Opening `/watch?v=uSiHqxgE2d0&list=RDuSiHqxgE2d0` returns the Mix entries. Both the Android extractor and Node lookup now use that watch URL while retaining the canonical playlist URL for caching, playlist identity, and retries.

Generated video-seeded Mixes import a snapshot of up to 100 source positions. The download dialog explains this before starting. Saved public/unlisted playlists retain pagination beyond 100 entries. Unavailable items retain their source positions; already saved audio is reused on retry.

The focused fix is present in the shared project. Android checks use an isolated source/dependency copy and separate emulator so other sessions' generated files and devices stay untouched. After both Claude sessions completed, the combined 1.4.0 release was prepared with their finished changes.

Automated verification on 2026-10-27:

- 58 Node tests passed, including the extractor seed URL and Mix pagination boundary regressions.
- 33 browser tests passed; the two hosted-only tests were skipped locally. Coverage includes a completed Mix snapshot, persistent playlist creation, alternate-URL retry without duplicate downloads, saved playlists beyond 100 entries, and cancellation.
- Five Android playlist instrumentation tests passed. The new snapshot test was first run against the unpatched APK and failed as expected.
- Eleven Android JVM tests passed.

The live network check is `tests/android-mix.mjs`. It reads the user's actual Mix through the native plugin, downloads real MP3 audio until two songs are saved, cancels the remaining download, reopens the app without Wi-Fi/mobile data, and verifies native offline playback. This is a bounded smoke test, not a claim that all 100 songs were downloaded or that YouTube will serve every video. Its result is recorded in `mobile-artifacts/mix-live-verification.json` after execution.

The completed run returned 100 entries in 17.9 seconds, saved the Ray Charles seed song (2,937,644 bytes) and a second Mix song (5,810,732 bytes), retained their local playlist, and passed offline reopen/native playback. An earlier constrained-emulator run timed out during conversion; the completed repeat used 4 GB RAM. A desktop control converted the same seed to MP3 in 18.9 seconds. These are observations under the recorded conditions, not device-wide latency guarantees.

Run only against a separate debug emulator, for example:

```sh
ANDROID_SERIAL=emulator-5556 ADB=/home/med/Android/Sdk/platform-tools/adb node tests/android-mix.mjs
```

Review also identified Spotify matches accepting unrelated artists or unrequested covers/live versions. The completed Spotify import now requires primary-artist evidence and rejects unrequested recording variants; regressions cover both cases. The active native playback optimizations are outside this focused fix and require final verification after they finish.
