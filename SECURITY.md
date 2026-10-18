# Security policy

## Supported code

Security fixes target the latest code on `main`. Older APKs do not update themselves; users need an updated build. The project is actively developed and does not provide a guaranteed support period or response time.

## Report privately

Use [GitHub's private vulnerability reporting](https://github.com/Medgleiguem/sonora-music-hub/security/advisories/new). Do not open a public issue containing an exploit, credentials, cookies, private audio or signed media URLs.

Include the affected version/commit, platform, impact, reproduction steps and a minimal proof of concept using generated or public test data. Please give the maintainer time to investigate before public disclosure.

Relevant areas include unsafe external URL handling, path traversal, subprocess execution, denial of service beyond existing resource bounds, unintended data exposure and Android component/URI permissions. Ordinary YouTube refusals, unsupported videos and network errors belong in bug reports unless a security impact is demonstrated.

Never send passwords, signing keys, account cookies or complete environment files. Redact sensitive data from browser traces and native logs. There is no paid bug bounty program.
