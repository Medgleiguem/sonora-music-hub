# Website analytics and Android download starts

Vercel Web Analytics is enabled for the existing Sonora project. The Next.js root layout tracks the music website, and the static installer pages load the Vercel script directly. This website change does not add tracking inside the Android APK.

Open [Sonora Analytics](https://vercel.com/meds-projects-9af78741/sonora-music-hub/analytics), select **Production** and the desired date range, then expand **Pages**:

| Page | Meaning |
| --- | --- |
| `/` | Music website visits |
| `/downloads/index.html` | Android installer page visits |
| `/downloads/start-arm64.html` | Starts requested through the 64-bit download page |
| `/downloads/start-arm32.html` | Starts requested through the 32-bit download page |

Use page views for download-start attempts and Visitors for an estimate of visitors to each start page. The same person can visit both architecture pages, so adding their visitor counts does not produce a deduplicated total. Reloading a start page starts another download and can add another page view. Verification visits can appear in the initial data. Tracking starts with this deployment; it cannot recover past downloads.

The installer links navigate to separate start pages, which automatically request the original APK after 800 milliseconds. The manual download link works if automatic downloading is blocked or JavaScript is disabled. An early manual click cancels the pending automatic request. Downloading does not depend on the analytics script loading or succeeding.

These metrics measure visits to download-start pages, not completed transfers or installed apps. Closing the page early, download failures, ad blockers and direct APK links can cause differences between analytics and actual downloads. Direct APK links and source archive downloads are not counted by these pages. The browser does not expose a reliable completion or Android-installation signal for an ordinary APK download.

The setup uses normal page views on the existing Hobby plan. It does not use paid custom events or change the plan. See [Vercel's current plan limits](https://vercel.com/docs/analytics/limits-and-pricing).

## Packaging and verification

`mobile/installer.html` and `mobile/download-start.html` are the templates. `npm run package:android -- --public` renders them into the ignored `public/downloads/` directory for future releases. Deploy the complete website with that directory present. APKs, their matching application source archive, and the published checksum manifest are preserved for this website-only update.

Packaging tests validate both rendered architecture pages. Browser tests cover automatic downloads with analytics blocked, the 320-pixel layout, manual downloading without JavaScript, and prevention of duplicate automatic downloads after an early manual click. Live verification checks actual Vercel `/view` submissions, including the generated endpoint used by the Next.js SDK. Vercel intentionally excludes automated browsers, so a separate isolated verification browser uses a normal browser identity.
