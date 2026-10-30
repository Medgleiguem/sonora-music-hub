# Search and playback performance, Android 1.3

Measured on the existing Android 16 x86_64 emulator on 2026-10-26. Measurements are connection/device-specific, not phone latency guarantees. Version 1.3.0 uses Android versionCode 6.

## Baseline and experiments

- Existing desktop extraction, three distinct music searches: 4,970 / 4,373 / 4,064 ms for 24 results.
- Public search HTML, three uncached requests: 1,991 / 1,000 / 1,373 ms for the first page (20 videos). A continuation request returned another 20 in 1,203 ms. The optimized path must preserve the 24-result limit rather than claim a win by returning fewer songs.
- Android baseline and optimized observations use the same emulator, queries, result limit, and `tests/android-performance.mjs`. Raw reports live in ignored `mobile-artifacts/performance-*.json`.
- Baseline Android fresh searches: 12,856 / 7,049 / 6,164 ms for the same 24 results; repeated queries: 89 / 10 / 30 ms.
- Baseline playback: one Fairuz clip timed out at 46,693 ms; a second music clip started in 43,165 ms and reopening it took 38,685 ms. Failures are not counted as successful playback.
- Rejected experiment: skipping extractor webpage/client configuration requests reduced desktop extraction time from 3,930 to 2,670 ms but turned a successful stream resolution into a bot-check refusal. This option is not shipped.
- Rejected experiment: skipping HLS/DASH manifests for progressive streaming did not improve native startup (33,024 / 38,052 ms versus 31,868 / 34,810 ms without it); reverted rather than retain an unproven setting.
- Short-lived private stream reuse reduced reopening successful songs to 1,251–1,384 ms in the first repeated measurement. First-song startup still requires upstream extraction; no general cold-start improvement is claimed.

## Final measured results

The same three queries returned 24 songs before and after the change. Final results explicitly reported the native search backend, rather than the extractor fallback.

| Fresh query | Baseline | Final native path |
| --- | ---: | ---: |
| فيروز Fairuz | 12,856 ms | 1,718 ms |
| جوليا بطرس مقاوم | 7,049 ms | 1,017 ms |
| Fairuz morning | 6,164 ms | 1,064 ms |

A separate fully warm follow-up returned all three queries in 6–8 ms. One earlier warm-labelled request took 1,692 ms; caching is not a latency guarantee. An intermediate candidate still used the extractor fallback, so its lower timings are treated as network variance, not proof of the native optimization.

For the same playable music upload `_D2fK-HhTvo`, reopening fell from 38,685 ms to 1,251 ms, with a later repeat at 1,278 ms. The cache is process-local, holds at most four successful resolutions, expires within two minutes or before signed expiry, and never stores signed addresses on disk, in queue state, or in logs. A refused cached address is invalidated and refreshed at most once.

Cold playback still performs extraction and JavaScript challenge processing. A stage trace measured 16,457 ms for one resolution, including about nine seconds in QuickJS. Other end-to-end cold starts ranged above 30 seconds. This release does not claim that all first plays are instant or that YouTube refusals are fixed.

## Correctness gates

Twenty-two deterministic native instrumentation checks passed, including continuation, Unicode parsing, unsupported-layout fallback, whole-request deadlines, cancellation, cache expiry, and independence of playback from busy metadata workers. The public-page live probe returned 24 results. Eleven JVM tests and 45 Node tests passed before release packaging. Existing playlist/artist functionality and its browser regressions remain part of this release.

The review identified and fixed three issues: mixed/unknown search layouts now fall back, HTTP loading obeys an absolute deadline, and playback uses execution capacity separate from metadata lookups. A live page's non-object configuration calls and filter menu were added as regression fixtures after they exposed compatibility failures.

## Implementation sequence

1. Benchmark the unchanged APK, including fresh searches, repeat searches, first stream start, and reopening the same stream.
2. Implement a bounded native metadata search path using the public page and its continuation context, retaining yt-dlp when the page shape is unsupported. Keep cancellation, query/result limits, typed results, and the existing metadata cache.
3. Reuse successful validated stream resolutions briefly in process memory. Respect their expiry, bound memory, keep signed URLs out of public state/logs/disk, and invalidate a refused cached address before one fresh resolution attempt. Do not cache failures or weaken URL/header validation.
4. Re-measure under the same conditions. Keep only demonstrated gains, run regression/device checks, build version 1.3.0/versionCode 6 with the existing signing certificate, and stage the complete website with the new ARM APKs and source.
5. Verify staged artifacts and public download behavior, publish to the existing website, then verify anonymous APK hashes, version, signature, and installer links. Preserve the previous deployment for rollback.

No paid services, new accounts, credentials in the client, or changes to media conversion quality are required.
