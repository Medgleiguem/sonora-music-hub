# Android 1.2.1 — 2026-10-18

VersionCode 4. This patch adds “Made by Med Gleiguem” beneath mobile navigation, at the bottom of the desktop sidebar and on the installer. Mobile layout reserves a separate 24-pixel credit row while retaining 76-pixel navigation controls and the device's bottom safe area. The player, banners and page content use the same updated navigation height.

The owner approved publishing application source under GPL-3.0. The repository now includes a license, README, contributor guide, security policy, Code of Conduct, changelog, dependency notices, issue/PR templates and CI. The maintainer's signing material and private configuration remain excluded. Contributor builds use their own keys and cannot update a maintainer-signed installation.

The 1.2 native player and extraction behavior are unchanged. **YouTube streaming and downloading remain experimental; the “Moqawem” refusal is not fixed by this patch.** See [1.2 verification and limitations](android-release-1.2.md).

The public installer is part of the full website at `/android`; APKs, source and checksums live under `/downloads/`. Release assets remain out of Git. The mobile bundler excludes those website downloads so a previous APK is never embedded in a new APK. The final arm64 build is 72,617,927 bytes and retains the original release certificate.

The author credit was inspected in a real browser at 320, 412, 768, 900 and 1440 pixels, including navigation touch targets and overlap. The production browser suite passed 18 checks, with the two deployment-only checks intentionally excluded locally. Clean-source installation, 25 Node tests, production web/mobile builds and Android JVM/debug compilation passed without private environment or signing files.

Source-publication checks include full-history and publishable-source secret scanning, checks against known private configuration values, immutable CI Action references validated with actionlint, dependency-lock comparison, source archive exclusions, and installation/build/tests from a clean source export without local environment files or generated assets. Deployment URLs and artifact verification are recorded in [the deployment log](vercel-launch.md).
