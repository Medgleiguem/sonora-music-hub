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
