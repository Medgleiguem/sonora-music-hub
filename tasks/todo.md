# Historical Android launch checklist

This records an earlier release. Current behavior, unresolved YouTube failures and open contribution priorities are documented in [README](../README.md), [CONTRIBUTING](../CONTRIBUTING.md) and [the 1.2 release notes](../docs/android-release-1.2.md). Source publication is now approved under GPL-3.0-only; older private-source statements below are historical.

- [x] Real Android download and MP3 conversion proof
- [x] Shared UI bundle and restricted native bridge
- [x] Progress, cancellation, bounded file transfer and library integration
- [x] Native and web regression checks
- [x] Distributable APK, license notices and honest iPhone status

Android installer: protected preview `dpl_J2kuHeHFoeuW2oXGSDbx8DfqStMp`, https://sonora-music-438105awl-meds-projects-9af78741.vercel.app . Hosted APK SHA-256 matches the signed local APK. App source is included behind the same protection. No public source license/visibility change was made.

Website candidate: `dpl_6UUBbVq8JGzobsXJqKAKF8QZBXyE`. Final local and staged hosted download-choice tests passed. Production promotion and public URL checks are recorded in `docs/vercel-launch.md`.

Final public deployment: `dpl_8Zx6yCxahX3C8bu5nQJzgzGZkiiV`, https://sonora-music-hub-six.vercel.app . Eight production checks passed before the installer-link correction; both affected hosted checks passed again afterward.
