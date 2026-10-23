# Android installer sharing preview

The installer at `https://sonora.gleiguem.com/downloads/index.html` serves Open Graph and large-image Twitter card metadata directly in its HTML, so crawlers do not need JavaScript. The canonical URL and artwork URL use the public custom domain. The main music player's metadata is separate.

- Title: Sonora — Download for Android
- Description: Your private music library. Listen offline, with background playback and Android media controls.
- Artwork: `public/sonora-share.jpg`, a 1200 × 630 progressive JPEG, 79,418 bytes.
- Editable artwork: `mobile/sonora-share.svg`, using the existing Sonora colors and logo with illustrated music players.
- Installer source: `mobile/installer.html`; `npm run package:android -- --public` renders this into the ignored `public/downloads/index.html`.

Regenerate the JPEG with the installed Sharp package:

```sh
node --input-type=module -e "import sharp from 'sharp'; await sharp('mobile/sonora-share.svg').jpeg({quality:88,mozjpeg:true}).toFile('public/sonora-share.jpg');"
```

Deploy the full website, including `public/downloads/` and the root artwork. A separate installer-only deployment references the production artwork URL. Messaging apps control the final card layout and refresh timing; the local example is an illustration, not a captured WhatsApp message.

## Publication — 2026-10-20

Deployment `dpl_944vbvCCzcAw6B9FrjGeuCGvMwZT`, `https://sonora-music-oafspgg4t-meds-projects-9af78741.vercel.app`, was built from the checksum-verified source archive of the previous published release. Only the installer head metadata and artwork were changed. Published APKs, their source archive, checksums and installer body were retained unchanged. This isolated deployment avoided publishing unrelated workspace edits.

The previous deployment, `dpl_FZ2GNi5o5nHrgzuWFzCr7n7SNGkt`, `https://sonora-music-ql3k1h67t-meds-projects-9af78741.vercel.app`, remains the rollback target using Vercel promote.

Local verification: production build, all 29 Node tests, and isolated Chrome checks with JavaScript disabled passed. Staging checks confirmed exact page and JPEG contents and unchanged download checksums. Anonymous public Chrome verification passed for the metadata, JPEG bytes and dimensions, anonymous WhatsApp/Facebook user-agent responses, Android APK headers and lengths, and installer layouts at 320, 412 and 1440 pixels. No actual WhatsApp-client preview has been observed.
