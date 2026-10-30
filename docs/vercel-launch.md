# Vercel launch status

## Website analytics and download starts — 2026-10-20

The existing Hobby project has Vercel Web Analytics enabled. Website deployment `dpl_EPJBsuTTNmNhkE8mbRfuJezokJwE`, https://sonora-music-qkmzi3bmy-meds-projects-9af78741.vercel.app, adds the Next.js analytics component, static installer analytics and owner-approved download-start pages for both ARM architectures. The published APKs, matching source archive and checksum manifest are unchanged. Deployment source was isolated from unrelated workspace edits using the prior published source snapshot. The prior website without analytics is `dpl_944vbvCCzcAw6B9FrjGeuCGvMwZT`; the visitor-analytics-only release is `dpl_9BwJVJStDNYegz5ji6TPYgpuMUmk`.

In Vercel Analytics, expand Pages and inspect `/downloads/start-arm64.html` and `/downloads/start-arm32.html`. These page views estimate download starts; they do not prove completed transfers or installations. Ordinary visits to `/downloads/index.html` remain separate. No paid plan or custom events are used. See [analytics operation and limits](analytics.md).

Verification: production builds, 30 Node tests and four browser checks passed. The browser suite covers automatic downloading with analytics blocked, a 320-pixel viewport, the JavaScript-disabled manual fallback and prevention of a duplicate download after an early manual click. Both final staged start pages matched the rendered templates byte for byte, and the checksum manifest matched the previous public release. Public visitor-analytics checks confirmed HTTP 200 Vercel page-view submissions from the music website and installer, including the generated Next.js collection endpoint.

Post-promotion anonymous browser checks on `https://sonora.gleiguem.com` confirmed accepted HTTP 200 Vercel page views for `/`, `/downloads/index.html` and both download-start pages, with no JavaScript errors. Both start pages initiated the correctly named architecture download; those browser checks substituted small test responses for APK bodies. All preserved APK/source files were separately verified against the published SHA-256 manifest. Verification visits may appear among the initial analytics counts.

Source-publication update, 2026-10-18: the owner approved open-source publication under GPL-3.0. References below to private source or missing publication approval describe historical release conditions. The public source and contribution policy are now defined in the root README, LICENSE and CONTRIBUTING files. Existing historical APK installer previews remain protected; version 1.2.1 adds an owner-authorized public installer on the main website.

## Android 1.2.1 and public source — 2026-10-18

- Public website: https://sonora-music-hub-six.vercel.app
- Shareable Android installer: https://sonora-music-hub-six.vercel.app/android — redirects to `/downloads/index.html`; no Vercel login required.
- Promoted deployment: `dpl_GHJnNxEJrBN8DeGCr38kLjQUYYCA`, https://sonora-music-cm1cbahc0-meds-projects-9af78741.vercel.app
- Public GPL-3.0 application source: https://github.com/Medgleiguem/sonora-music-hub, release tag `v1.2.1` at `8c6d9744390b15d02ab013ec964c790ad5d9c04c`.
- Previous public website retained for rollback: `dpl_HpXgkG7KHwaMptgg6SZdQSawq23W`. Its installer link points to the older protected preview.

The owner explicitly approved public source publication, GPL-3.0 and a public Vercel installer. The full website is deployed from the root; it retains the music app and adds signed APKs, application source and checksums under `/downloads/`. `npm run package:android -- --public` prepares the ignored release files. They must be prepared again for future website deployments. No clean-source Git auto-deployment is connected. The mobile bundler excludes website download artifacts to prevent nesting an old APK inside a new one.

An unauthenticated full download of the live arm64 APK matched the signed local release byte for byte: 72,617,927 bytes, SHA-256 `850a50180b45031048c3c3c9a116372562944827acaac8cd9eb1d01d9e5a38a6`. Arm32 SHA-256: `00d975abd0d494d1332f5beb49fb0db80898242efe8a495d302792f5091b6c43`. Application source archive SHA-256: `6bc8ffc15541008822acbbfbf3f270b2bc698f130a6cf405e83be850fee6c2a7`. The hosted checksum manifest matches the release. VersionCode 4 retains the original signing certificate, and the APK contains “Made by Med Gleiguem”. Historical installer previews remain protected; the public domain above is the shareable link.

Verification: 27 Node tests passed, including a cache regression that fails against the old service worker. Clean-source installation, web/mobile production builds, 18 local browser checks and Android JVM/debug builds passed. Both GitHub CI jobs passed on the release code with Node 22/JDK 21. The first runner failed because `sdkmanager` was not on PATH; the corrected workflow uses its installed absolute SDK location. Twelve staged and twelve anonymous post-promotion browser checks passed. A real-browser check also verified the installer redirect, credited page, APK content headers and offline music-app reopen after visiting the installer. The service worker bypasses `/android` and `/downloads/` and uses a separate v5 shell cache.

Full Git-history and publishable-source Gitleaks scans found no leaks; known private configuration values were checked separately without logging their contents. GitHub detects the license, README and contribution/community files. Private vulnerability reporting, secret scanning and push protection are enabled. Contributor PRs require the web/Android checks, resolved conversations and maintainer review; owner administration access is retained. No signing key, environment file, user music or generated APK is committed to Git.

The author credit was inspected at 320, 412, 768, 900 and 1440 pixels. Native playback/extraction behavior is unchanged from 1.2: YouTube refusals for “Moqawem” remain unresolved; physical A35, Bluetooth hardware and calls remain unverified. See [1.2.1 notes](android-release-1.2.1.md).

## Android 1.2.0 — 2026-10-18

- Protected installer/source preview: `dpl_GE7bzJvedGBA9grPs2t5Xom54CCH`, https://sonora-music-px0engvor-meds-projects-9af78741.vercel.app
- Promoted website: `dpl_HpXgkG7KHwaMptgg6SZdQSawq23W`, https://sonora-music-lpkwtaqyu-meds-projects-9af78741.vercel.app
- Public website: https://sonora-music-hub-six.vercel.app
- Previous website retained for rollback: `dpl_CCi5vt8KZa2Jtiya45pzwGRthoLG`. The previous protected installer remains available too.

The signed arm64 APK downloaded through the authenticated Vercel CLI matches the packaged release byte for byte: 72,617,607 bytes, SHA-256 `e9203e5c3368ecda522aeb3c6798f8e431888fc1bebdaedf67721e1113666b88`. VersionCode 3 retains the original signing certificate. The hosted checksums match the local manifest. Anonymous installer access redirects to Vercel authentication; source remains protected. The arm32 APK SHA-256 is `3893ab2b8b433a9671c6d5eb01d73ce9af6a8979f21850a0285bee8a5dcbe8f3`; the source archive SHA-256 is `7370c8ac4ea64eb1a77961adf55d008cf13d8e44cb50c64befb87f489bd5be04`.

Validation: 25 Node tests, 18 local production-browser checks, 11 native JVM tests and 18 deterministic Android instrumentation tests passed. Real WebView/native tests on the final build verified local screen-off playback and queue advancement despite Activity/WebView destruction, recovery, system transport controls, seeking, metadata, and actual HTTPS catalog streaming with screen-off progress. The stream check waits for decoded progress before measuring background continuation, because playWhenReady can be true while buffering. The dependency audit reports zero known vulnerabilities. Physical A35, Bluetooth hardware and phone-call interruption remain unverified.

Twelve staged hosted browser checks passed before the website was promoted. All twelve anonymous post-promotion checks passed on the public domain, including the installer link, phone layouts, large-library search, native bridge integration, storage recovery and offline reopen/playback. The website links to the new installer; installing the APK update is still required on existing phones. No paid service, credentials extraction, proxy, public source publication or plan change was used.

**Unresolved:** YouTube refused both streaming and downloading Julia Boutros “Moqawem” and a second short public clip on the emulator connection. Search succeeded; cold/warm times were 12.18 seconds/51 milliseconds. The newer engine and player do not establish a fix for live YouTube refusals. This release must not be represented as completing that requirement. See [release details](android-release-1.2.md).

## Android 1.1.0 — 2026-10-18

- Protected installer/source preview: `dpl_CHYF8vUyQRRmKtvnXaLeB2uDrNaM`, https://sonora-music-m70mc5c0i-meds-projects-9af78741.vercel.app
- Promoted website: `dpl_CCi5vt8KZa2Jtiya45pzwGRthoLG`, https://sonora-music-2hhfmzliz-meds-projects-9af78741.vercel.app
- Public website: https://sonora-music-hub-six.vercel.app
- Previous website retained for rollback: `dpl_8Zx6yCxahX3C8bu5nQJzgzGZkiiV`.

The signed arm64 APK downloaded through the authenticated Vercel CLI matches the local release byte for byte: 66,142,242 bytes, SHA-256 `47591e2000388c90369a9ad1e350893d4fb1a89a77d2f3f966446cec29dac06a`. Hosted checksums match the packaged manifest. Anonymous installer access redirects to Vercel authentication; source remains protected alongside the installer. The signed update retains the original signing certificate and uses versionCode 2.

Release checks: 19 Node tests, 17 local production-browser checks, seven native instrumentation tests, and separate emulator checks for actual downloads, offline playback, background/Activity recovery, denied notification permission, foreground playlist waiting and notification cancellation. The final foreground-wait regression was reproduced with a compressed second-track timeout on the old APK, then passed on the fixed APK. The complete dependency audit reports zero known vulnerabilities. Physical Samsung A35 behavior remains unverified.

The installer was deployed with `deploy --prebuilt --yes` as a preview. The full website was separately staged with `deploy --prod --skip-domain --yes`; its download action points to the new installer. Eleven hosted candidate checks passed, including a corrected dialog test that selects the hosted installer link rather than the local conversion button. The website was then successfully promoted to the existing public domain. No public source publication, paid service or plan change was used.

All eleven anonymous post-promotion browser checks passed on `sonora-music-hub-six.vercel.app`: Android installer/import choices, small-phone layout, 600-track pagination/search, accessible closed navigation, touch targets and dialog Close visibility, stable audio allocation, playback continuity, invalid-file recovery, database-open retry, full-storage recovery and offline reopen/playback.

## Previous release — 2026-09-05

### Previous deployment

- Public PWA: https://sonora-music-hub-six.vercel.app
- Current website deployment: `dpl_8Zx6yCxahX3C8bu5nQJzgzGZkiiV`, https://sonora-music-8ohroi5s7-meds-projects-9af78741.vercel.app
- Protected Android installer/source preview: `dpl_J2kuHeHFoeuW2oXGSDbx8DfqStMp`, https://sonora-music-438105awl-meds-projects-9af78741.vercel.app
- Website rollback: `dpl_BB9Vq5JMtYW87h3HSVvQjt187Zdu` remains available.

The public music website was promoted successfully after its staged checks passed. It remains a PWA. Hosted download actions now lead to the Android installer or file imports; direct Vercel conversion calls immediately return `ANDROID_DOWNLOAD_REQUIRED` rather than waiting for a known upstream refusal. Compatible local Next.js installations retain the unified Node converter.

The Android app performs extraction and conversion on the device. Five Android instrumentation tests pass, including real MP3/M4A/Opus conversion and cancellation of subprocess children. A separate real WebView test passed MP3 download, file export, IndexedDB persistence, offline reopen/playback and Android Back. Native search and the official YouTube player were checked too. The signed release installs and renders successfully on Android 16 x86_64. A physical arm64 phone and native iPhone conversion remain unverified.

The hosted arm64 APK is 63,194,892 bytes, with SHA-256 `5249bb9e6256774b487fc78d3b4e77b6778d816ab29e9df065cd24d45c8b57ba`. A full authenticated download from Vercel matched the local signed APK. Anonymous access redirects to Vercel authentication; app source is protected with the installer. The installed app itself needs neither a Vercel login nor a running computer. Signing keys and service credentials were excluded from both the APK client assets and source archive and checked against local private values.

The installer-only production-target attempt was rejected by automatic approval review due to concern about replacing the existing app. A protected **preview** was used instead, without promoting installer contents or changing the public website. The full Next.js website update was separately staged, verified and promoted. No paid service, trial or plan change was used.

Validation: 19 Node tests, 13 local production-browser regressions, five Android instrumentation tests, the native WebView workflow, two final hosted-choice checks locally and on the staged deployment; final production dependency audit reports zero vulnerabilities. Post-promotion public checks are recorded below.

All eight post-promotion public browser checks passed: Android installer/import choices, small-phone layout, stable audio allocation, playback continuity after favoriting, invalid-file recovery, retry after storage opening failures, full-storage recovery, and offline PWA reopen/playback.

## Earlier Vercel-only investigation

The unified app was deployed successfully to the existing `sonora-music-hub` project using `vercel deploy --prod --skip-domain --yes`.

- Candidate deployment: `dpl_9aGadfAn7TesgN9H7y1qGEMxHjjY`
- Candidate URL: https://sonora-music-foxhog9m4-meds-projects-9af78741.vercel.app
- Existing production / rollback deployment: `dpl_BB9Vq5JMtYW87h3HSVvQjt187Zdu`
- Existing public URL: https://sonora-music-hub-six.vercel.app
- Runtime: Node.js 24.x, Fluid compute enabled, iad1.

The cloud build succeeded. The CLI lost its connection after output deployment, but a subsequent `vercel inspect` confirmed READY. The production Jamendo client ID was migrated from local configuration to `NEXT_PUBLIC_JAMENDO_CLIENT_ID`; other existing environment values were preserved. Local `.deploy.env` was added to `.vercelignore` to keep that private configuration out of uploaded source.

## Verified on the hosted candidate

- YouTube search: HTTP 200, 24 results.
- Playlist lookup: HTTP 200, 13 entries from a public playlist.
- All 13 Playwright browser checks pass against the real candidate URL, including offline startup and playback, mobile layouts, storage recovery and download UI. Download success/incomplete-transfer browser cases use stubbed upstream responses; they do not prove live conversion.
- The migrated Jamendo client ID successfully queries the Jamendo catalog.

## Budget constraint

The user requires free services only. Paid proxies, paid download APIs, purchases, and trials that require payment or renew into paid plans are excluded. No service was purchased. The earlier paid-service proposal was rejected and is not an active next step.

## Remaining blocker

A real download request reaches the bundled yt-dlp process but YouTube refuses Vercel's request. The response correctly reports the upstream failure. The same video converted successfully in the prior local smoke test.

The saved proxy configuration is a placeholder, not a working proxy. No paid service has been purchased. No verified free replacement connection is configured. Existing `YT_DLP_PROXY` support is optional code, not a required purchase or a verified solution.

### Internet research and hosted compatibility tests

Additional tests on 2026-09-05 used the same fixed public 19-second clip (`jNQXAC9IVRw`) and pinned yt-dlp 2026.08.19:

| Method | Location | Observed result |
| --- | --- | --- |
| Default native download | Vercel iad1 | YouTube sign-in / bot check |
| `web_embedded` client | Vercel iad1 | Same check |
| `web_safari` client | Vercel iad1 | Same check |
| `android` client | Vercel iad1 | Same check |
| `mweb` + bgutil 1.3.2, `fetch_pot=always` | Local | Plugin loaded and generated player/GVS/subtitle tokens |
| `mweb` + verified bgutil plugin | Vercel iad1 | Player token generated, then same YouTube sign-in check |
| `mweb` + verified bgutil plugin | Vercel fra1 | Player token generated, then same YouTube sign-in check |

An initial helper test used the wrong plugin directory and did not load the provider; it was corrected and repeated. Only the corrected runs support the helper conclusions above. Cloud builds successfully packaged the native downloader and helper. Temporary diagnostics accepted only a fixed public video and documented client choices, required a random server secret, and were removed after testing. No experimental helper dependency remains in the app. All three temporary diagnostic deployments were deleted; the staging alias was restored to the original clean candidate. The public `sonora-music-hub-six.vercel.app` URL was verified to still resolve to the rollback deployment.

Sources: [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide), [maintained bgutil provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider). The provider itself states that tokens do not guarantee removal of bot checks. The older [trusted-session generator](https://github.com/iv-org/youtube-trusted-session-generator) is deprecated and was not integrated.

A further free-option review checked [Cobalt's official API README](https://github.com/imputnet/cobalt/blob/main/api/README.md) and [API documentation](https://github.com/imputnet/cobalt/blob/main/docs/api.md). Its maintainers provide no public pre-hosted API for third-party apps and require self-hosting or instance-owner permission. It was not integrated as an unverified external dependency.

The existing local Next.js download/conversion path passed a real smoke test without a proxy or paid service. Running it on the user's computer is a verified free alternative, but changes the requested Vercel-only hosting model and needs the user's choice. Keeping the Vercel app with imports and the offline library is another partial option; it must not be represented as fixing hosted YouTube downloads. No requested feature was removed and no new external service was created.

The user subsequently authorized an Android-first architecture change, with iPhone web access and no paid services. Real Android download/conversion, export and offline playback now pass. The former Vercel-only conversion launch condition is superseded by the Android plan in `tasks/plan.md`: serve an honest hosted download screen directing the owner to the tested Android installer, and retain local Node conversion for compatible hosts. Keep the APK and source on a protected preview for the owner's personal installation; public source publication was not authorized. Retain the previous website deployment for rollback; no Render service was deleted or changed.

## Running hosted browser regression checks

The Playwright config now accepts `PLAYWRIGHT_BASE_URL` and optional `PLAYWRIGHT_STORAGE_STATE`. Use an authenticated browser state for a protected candidate, or omit it for the public domain. Set `PLAYWRIGHT_PRODUCTION=1` to include offline-PWA tests. Store authentication state outside the repository and never commit it.

The final installer-link-only website update (`dpl_8Zx6yCxahX3C8bu5nQJzgzGZkiiV`) was promoted after the full eight-check public run; both hosted-choice checks passed again on the final public URL. The corrected source archive removes incorrect Capacitor sample tests. The signed APK is unchanged.


## Android 1.2.2 smaller installers — 2026-10-18

Published the complete website as deployment `dpl_FZ2GNi5o5nHrgzuWFzCr7n7SNGkt` (https://sonora-music-ql3k1h67t-meds-projects-9af78741.vercel.app), then promoted it to https://sonora-music-hub-six.vercel.app. The installer remains at `/downloads/index.html`, with `/android` redirecting there. The previous production deployment `dpl_GHJnNxEJrBN8DeGCr38kLjQUYYCA` (https://sonora-music-cm1cbahc0-meds-projects-9af78741.vercel.app) remains available for rollback using Vercel promote.

The initial universal APK exceeded Vercel Hobby's 100 MB file limit and the upload was rejected before promotion. At the user's request, the website now offers the complete architecture-specific installers: arm64 is 72,617,983 bytes and arm32 is 65,965,167 bytes. Both have prominent download buttons and compatibility guidance. The legacy `/downloads/sonora-android.apk` URL still serves arm64. No GitHub Release or additional hosting service was created. Native features, dependencies, audio settings and signing are unchanged.

Verification: 29 Node tests passed. Candidate browser verification passed 14 checks covering imports, local playback, playback position, offline reopening, library rendering, storage recovery, mobile layout and the hosted Android download flow. The installer was inspected at 320, 412 and 1440 pixels. After promotion, both hosted download-flow tests and all three installer widths passed without an authenticated session. Public HTTP checks verified page version, main website availability, APK content types and sizes, and the `/android` redirect. Full downloads of both ARM installers, the legacy APK URL and the application source archive matched the locally generated SHA-256 manifest exactly. Physical ARM-device installation still requires verification; the friend's reported architecture is not confirmed by the screenshots alone.


## Android 1.3.0 performance and playlists — 2026-10-26

Published deployment `dpl_BS74zrxd18D5Mvjx8Q12BWQ3PeGZ` (`https://sonora-music-dylzltgsy-meds-projects-9af78741.vercel.app`) after staging checks. Public installer: https://sonora.gleiguem.com/android . The original https://sonora-music-hub-six.vercel.app address serves the same release. Previous production deployment `dpl_EPJBsuTTNmNhkE8mbRfuJezokJwE` is retained for rollback. No paid plan, new hosting service, signing-key change, or GitHub release was introduced.

Version 1.3.0/versionCode 6 includes the approved playlist/artist features and measured native search/replay improvements. Fresh 24-result emulator queries measured 1.0–1.7 seconds versus 6.2–12.9 seconds; fully warm queries measured 6–8 ms in a follow-up. Reopening a successful stream measured about 1.3 seconds versus about 39 seconds. Cold first playback remains dependent on extraction and YouTube responses. Detailed evidence and rejected experiments are in `docs/performance-1.3.md`.

Both ARM APKs verify against the previous public certificate, retaining the in-place update path. Anonymous full downloads of both installers and the source archive matched the local SHA-256 manifest. The source archive and client assets were checked for nine private configuration values; none were found. Source and signing credentials remain separate.

| Public artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `sonora-android-arm64.apk` | 72714431 | `de91ff62c25f7dbfaa24fb58dd1c6922a808b9926f84d7be8185805269962762` |
| `sonora-android-arm32.apk` | 66061619 | `17b8e2d0138856ade4f1d02e91e6378c9a67ea982168549f7a7395a00c5ebdf4` |
| `sonora-android-source.zip` | 619527 | `f5e710884eeaeba109cf3af1b2ec2eec37b757e9d54f38f51d6a0d77e1c2f238` |

The legacy `sonora-android.apk` remains an arm64 alias. Both ARM files remain below the hosting file-size limit. Staged manifest, home page, installer and APK headers passed checks through authenticated Vercel requests; canonical public domains were verified without authentication after promotion.

Validation: 45 Node tests; 30 local production browser checks plus both anonymous hosted download checks; 22 deterministic Android instrumentation checks on the Android 16 x86_64 emulator; 11 JVM tests; web/mobile/signed release builds; matching signatures and version metadata. Physical ARM hardware remains unverified. Next.js was updated to 16.4.1 after release auditing found advisories in the prior dependency range; the final production npm audit reports zero known vulnerabilities.


## 1.4.0 combined release — 2026-10-27

Published deployment `dpl_8ogWR8JpBXN2MMfBhkkoukmauhB8` (`https://sonora-music-k3xk6pi8a-meds-projects-9af78741.vercel.app`) to the existing public domains after staged home, installer, manifest and both APK-header checks. VersionCode 7 combines the video-seeded Mix fix, Spotify import, and finished native playback improvements. The previous 1.3.0 deployment `dpl_BS74zrxd18D5Mvjx8Q12BWQ3PeGZ` is retained for rollback.

Both ARM installers preserve the existing certificate. Anonymous full downloads of both APKs and application source matched the release manifest. Both hosted browser checks passed. Local validation: 58 Node tests; 33 full browser checks plus 13 focused final production browser checks; 33 deterministic Android instrumentation checks; 13 JVM tests. The exact Mix yielded 100 entries, two real MP3s were saved into its local playlist and played after offline reopen; the final combined APK retained them during its in-place update. Two independently measured first stream starts completed in 1.63–2.08 seconds on the emulator. Physical ARM phone behavior remains unverified.

The production dependency audit reported zero vulnerabilities, and five configured private values were absent from the packaged application source and generated client assets. No Git commit, push, or GitHub release was performed.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `sonora-android-arm64.apk` | 72729583 | `2bc4a300efb95a00a4300fb23b3c3b266c6ba455ed2a2373c3b6846a51b96070` |
| `sonora-android-arm32.apk` | 66076767 | `4272fd6cfe9d76c6651fa19b2a088cac3d8d99e69457e0a7f647c5326c620abc` |
| `sonora-android-source.zip` | 647504 | `14c59c84210e871b36359bf224f775f92f33960c88375811eeb99a176224babe` |

## 1.5.0 downloads and online library — 2026-10-27

Published deployment `dpl_2YTHpXZainPb7jmWCAQRqcuZ1HXR` (`https://sonora-music-7mr2papf1-meds-projects-9af78741.vercel.app`) to the existing public domains after staged checks of the home page, installer page, manifest, and full downloads of both APKs and the source archive. VersionCode 8 adds online playlists, likes without downloading, concurrent downloads with Stop/Resume, background Android downloads, and a direct download path. The previous 1.4.0 deployment `dpl_8ogWR8JpBXN2MMfBhkkoukmauhB8` is retained for rollback.

Both ARM installers keep the existing certificate (`acc829c5…cfa9`); an in-place update from the published 1.4.0 arm64 APK preserved the library. Anonymous full downloads from https://sonora.gleiguem.com matched the release manifest, and 9 hosted browser checks passed. Local validation: 68 Node tests; 38 production browser checks (2 hosted-only skipped locally); 17 JVM tests; 40 instrumentation tests; emulator flows for a real download and export, offline playback, a playlist finishing in the background, a real YouTube Mix stopped partway, and Activity recovery. The emulator's ARM translation cannot run the bundled ARM media executables (the published 1.4.0 runtime is affected identically), so ARM media was checked statically: the pruned arm64 runtime removes the same 59 files as the tested x86_64 runtime and breaks no dynamic-link dependency. Physical ARM phone behavior remains unverified.

The source archive now excludes the ignored `android/lite-media/` build output. Private configuration values were absent from the source archive and client assets; the only match was the public Jamendo client ID used by the browser. No Git commit, push, or GitHub release was performed.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `sonora-android-arm64.apk` | 65531175 | `0333171a84e46638ac528b42beb59dc68fd35da28abeeaee74afcf9b1e58f2b2` |
| `sonora-android-arm32.apk` | 59563051 | `517543b93df52bb1e3581479fbbf3e5544ca951c45797ab66e296d89858ef251` |
| `sonora-android-source.zip` | 680658 | `15844af16ce20ca37081a7852150667c53d747e8921b8c52c007d384c696a10a` |

## 1.6.0 redesign, Spotify fix and online imports — 2026-10-28

Published deployment `dpl_Eno7H3xWTQWV75Dr6vo3CfE2pv9n` (`https://sonora-music-b8114ph8n-meds-projects-9af78741.vercel.app`) to the existing public domains after staged checks (via authenticated `vercel curl`) of the home page, installer page, checksums, and full downloads of both APKs and the source archive. The previous 1.5.0 deployment `dpl_2YTHpXZainPb7jmWCAQRqcuZ1HXR` (`https://sonora-music-7mr2papf1-meds-projects-9af78741.vercel.app`) is retained for rollback with `vercel promote`.

VersionCode 9 replaces the interface with a three-tab phone design (Home, Search, Library), removes the Jamendo catalog, fixes Spotify downloads, and adds online (no-download) imports for Spotify. Root cause of the Spotify failures: Android allows two concurrent searches and refused the rest with "Search is busy", while downloads matched three songs at once with no retry. Matching is now serialized, temporary errors are retried with backoff, leftover songs get one final pass, and interrupted downloads resume when Sonora reopens. On the x86_64 emulator a real 14-song Spotify album went from 2 of 14 saved to 14 of 14 without Resume; a real 13-song album was added for online listening and streamed.

Both ARM installers keep the existing certificate (`acc829c5…cfa9`); an in-place update from the published 1.5.0 arm64 APK preserved its liked songs. Anonymous full downloads from https://sonora.gleiguem.com matched the manifest and 9 hosted browser checks passed. Local validation: 72 Node tests and 37 browser checks (2 hosted-only skipped). Private configuration values were absent from the source archive and app bundle (12 checked); the Jamendo client ID is no longer shipped. Physical ARM phone behavior remains unverified. No Git commit, push, or GitHub release was performed.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `sonora-android-arm64.apk` | 65525911 | `5faaac8c5b54bcabd06b94c3b78ccd76e3193142171eb195e35a49774ef89f5c` |
| `sonora-android-arm32.apk` | 59557791 | `50142849d06b7cde332878a65fe65fc28f71518ec1487d8e3c12ac1d17d749ef` |
| `sonora-android-source.zip` | 688129 | `6bf2fcad4c0d282f6de2acdbb6035d431a2f33e62d0b934e70953065587940de` |

## 1.7.0 polish and fixes — 2026-10-28

Published deployment `dpl_EfwKvRPwo7Z1pn8ztWdPTmixnQRE` (`https://sonora-music-f4xtvdmwk-meds-projects-9af78741.vercel.app`) after staged checks of checksums, full downloads of both APKs and the source archive, the installer page, and the home page. The previous 1.6.0 deployment `dpl_Eno7H3xWTQWV75Dr6vo3CfE2pv9n` is retained for rollback.

VersionCode 10 fixes Shuffle (the Detail button passed the click event instead of the list), sideways scrolling (unclipped blurred backdrops and pinch zoom), the tab bar vanishing after typing (now keyed to the keyboard actually being open), and Spotify matching for transliterated titles (spelling-tolerant words plus a close-length fallback). It adds Android full screen with a Settings switch, an immediate loading state, 1 MiB native staging pieces, Search buttons for unmatched songs, and the M/GL signature. Same certificate (`acc829c5…cfa9`); an in-place update from the published 1.6.0 kept its library. Anonymous public downloads matched the manifest and 9 hosted checks passed. Local validation: 75 Node tests, 38 browser checks (2 hosted-only skipped), JVM unit tests. Physical ARM phone behavior remains unverified.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `sonora-android-arm64.apk` | see checksums.json | `b444fc1e7c8f1a3de834c723ecd7897411963ce5ceaf7a42667588b3a1d861c5` |
| `sonora-android-arm32.apk` | see checksums.json | `bb84b7d9ba3d4d425e605ac7d780901dfc0271614abd4cc969e03186adc5eed8` |
| `sonora-android-source.zip` | see checksums.json | `5a9ea7cc666eb6bf677b13a7365ba45cf14f3a5e41e4a9557768de847db18d09` |

## 1.7.1 icon and store-style listing — 2026-10-28

Published deployment `dpl_H4zcVE9qCQsHdFFQrXUSADhedA3v` (`https://sonora-music-ncuougfe2-meds-projects-9af78741.vercel.app`) after staged checks of both APKs and the source archive, the listing page, its ten store assets, and the share image. The previous 1.7.0 deployment `dpl_EfwKvRPwo7Z1pn8ztWdPTmixnQRE` is retained for rollback.

VersionCode 11 replaces the leftover lime launcher icon and splash with a vermilion sound-wave icon (adaptive, round, legacy densities and a monochrome themed icon), regenerated from one SVG; the PWA icons, favicon and share image use it too. `/downloads/index.html` is now a store-style listing built from eight real emulator screenshots (`mobile/store`, packaged by `scripts/package-android-release.mjs`), with what's new, data safety, app info and install steps; it shows no ratings or download counts. Same certificate (`acc829c5…cfa9`). Anonymous public downloads matched and 9 hosted checks passed. Local validation: 75 Node tests and 38 browser checks.

| Artifact | SHA-256 |
| --- | --- |
| `sonora-android-arm64.apk` | `515f824e26f5a854424173bb6f538979de6190dde2238d119678e6caebf92c70` |
| `sonora-android-arm32.apk` | `673edfc1e2f1818d159e0588cafa658539f8582345d9a4f7503400411a55903e` |
| `sonora-android-source.zip` | `87db2c3f2e613a88821370b28ad9e9bf66f305261599d9c80e6e746f9770861c` |

## Download page at the site root — 2026-10-28

Published deployment `dpl_BQh7fLo723weFhycWRtrZtp3gxuV` (`https://sonora-music-5jzms29sv-meds-projects-9af78741.vercel.app`); the previous deployment `dpl_H4zcVE9qCQsHdFFQrXUSADhedA3v` is retained for rollback. No APK change (1.7.1, same files).

`/`, `/download`, `/downloads` and `/android` now show the download listing (`beforeFiles` rewrites in `next.config.mjs`; the `/android` redirect was removed). The web player moved to `/app` (manifest `id`, `start_url` and `scope` are `/app`), and the service worker (cache `sonora-shell-v6`) now caches and serves only `/app` navigations. Root cause of the missing screenshots: the listing used relative `./store/` paths, which broke at `/downloads` without a trailing slash; all listing and download-start links are now absolute. Live checks confirmed every image loads at all five addresses; 15 hosted checks passed.
