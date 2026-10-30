# Changelog

## 1.7.1 — 2026-10-28

### Changed

- A new Sonora icon and splash screen: a white sound wave on a vermilion tile, with a monochrome version for Android's themed icons. The website and its install icons use it too.
- A new download page in the style of an app listing, with real screenshots, what's new, data safety, and app details.

## 1.7.0 — 2026-10-28

### Fixed

- Shuffle play on a playlist or collection now works and starts on a random song.
- Screens no longer scroll or drift sideways, and the app no longer zooms when pinched.
- The player and tab bar no longer disappear after typing in Search; they step aside only while the keyboard is open.
- Spotify imports find many more songs: spellings of transliterated titles and names are matched ("Nasseeny" and "Nassini", "Fairuz" and "Fayrouz"), results from every search are compared, and an upload with nearly the exact length by the right artist is accepted when titles cannot be compared, such as Arabic-script uploads.
- "Downloads need attention" no longer stays above the player after you have opened Downloads.
- Curated collections such as Arabic classics leave out hour-long compilations, and Arabic names display in the right order.

### Changed

- Sonora opens full screen on Android, hiding the status and navigation bars; swipe from an edge to see them. Turn it off in Settings. With the bars shown they are transparent, without a black strip.
- A song you tap appears in the player immediately with a loading indicator while its audio is prepared.
- Downloaded songs start faster: audio is handed to the Android player in larger pieces.
- Songs an import could not find have a Search button that opens Search with the artist and title filled in.
- Sonora · M/GL appears at the end of Home and in Settings.

## 1.6.0 — 2026-10-28

### Changed

- A new phone-first design with three tabs: Home, Search, and Library. The sidebar and separate Explore, Download, and Arabic classics pages are gone.
- Home shows your liked songs, downloads and playlists, recently played songs, popular songs, and Arabic classics as soon as Sonora opens.
- Search is the one place to type: search YouTube songs, playlists, and artists, or paste a YouTube or Spotify link. Recent searches and mood tiles appear before you type.
- Every pasted playlist offers two clear choices: Add to library (plays online, nothing downloaded) or Download (saved on this phone, plays offline).
- Downloads start with one tap and show their progress above the player instead of opening a window. Format and recovery copies moved to Settings; the rights confirmation is asked once.
- Playlists, Liked songs, Downloaded, YouTube playlists, artists, and mixes share one page with Play, Shuffle, Save, and Download.
- Now playing shows the song's artwork full screen, with Download, Add to playlist, and Queue.

### Added

- Add a Spotify playlist, album, or songs to your library for online listening without downloading anything.
- Rename playlists.

### Fixed

- Spotify playlist downloads no longer fail with "Search is busy": songs are matched one at a time, temporary errors are retried automatically, and leftover songs get one more try before anything is reported. On the test emulator a 14-song album that previously saved 2 of 14 now saves all 14 without pressing Resume.
- Downloads cut off when Android closed Sonora continue by themselves when Sonora opens again.

### Removed

- The Jamendo independent-music catalog. YouTube is the only music source; Spotify links are matched on YouTube.

## 1.5.0 — 2026-10-27

### Added

- Open a YouTube playlist from search and play, shuffle, or repeat it online before saving anything.
- Save a YouTube playlist or artist to your playlists as online songs without downloading. Pasted playlist links offer the same choice. Songs you already downloaded are reused.
- Like any song, including search results that are not downloaded. The heart is always visible on phones. Unliking an online song that is in no playlist removes it from the library.
- Download all on any playlist or Liked songs downloads its online songs in place, keeping likes, order, and other playlists unchanged.
- Run several downloads at once, from any number of playlists. A Downloads panel shows each download's progress and the songs downloading now, with Stop (finished songs are kept) and Resume. A banner and a badge on the Downloads tab show running downloads while you use the rest of Sonora.

### Changed

- Android downloads continue while Sonora is in the background, including when you leave immediately after starting a playlist. The notification shows overall progress and offers Cancel all.
- Android downloads fetch audio directly instead of starting the extractor for every song, with the extractor kept as a fallback. M4A and Opus are copied without re-encoding. On the test emulator a 3.5-minute song took 1.0 s as M4A and 7.2 s as MP3, versus 23.6 s before.
- M4A is the default download format; the chosen format, the rights confirmation, and the recovery-copy choice are remembered on the device.
- Up to 3 songs download at once on Android (2 on the website). Stopped or interrupted downloads are kept after Sonora closes and can be resumed.

## 1.4.0 — 2026-10-27

- Fix video-seeded YouTube Mix imports using the seed watch page, preserve playlist identity, and explain the finite 100-position Mix snapshot. Saved public/unlisted playlists still import beyond 100 songs.
- Import public Spotify playlists, albums, individual songs, and copied song links by matching available YouTube audio. Require artist evidence and reject unrequested covers/live versions.
- Start supported YouTube streams through a direct native resolver, retain extractor fallbacks, and prepare the next song in the background. Reuse validated stream addresses only in private memory, bounded by signed expiry.
- Force a bounded compatibility fallback if a fast stream URL is refused, retain cancellation, and bound resolution stages by a shared deadline.

## 1.3.0 — 2026-10-26

### Added

- Import public and unlisted YouTube playlists from a visible playlist action or playlist search results.
- Discover Songs, Playlists, and Artists separately in YouTube search.
- Open an artist channel, load its songs, and play, shuffle, or repeat an artist-only queue.
- Import Spotify playlists, albums, and songs without an account: Sonora matches each song on YouTube by title, artist, and length, then downloads it into a local playlist. Playlist links list their first 100 songs; songs copied from the Spotify desktop app (Ctrl+A, Ctrl+C) have no limit and can complete the same playlist.

### Changed

- Continue playlist imports beyond 100 entries using bounded metadata batches on Android and compatible Node hosts.
- Resume imports across alternate URL forms, reuse completed downloads, and restore source order when earlier failed songs succeed on retry.
- Use bounded native YouTube search with extractor fallback, preserving 24-result discovery and cancellation.
- Reuse successful stream resolutions briefly in private memory for faster replay and seeking, with expiry checks and a fresh lookup if a cached address is refused.
- Keep playback resolution independent of metadata search workers so searches cannot queue ahead of playback.

### Security

- Update the website framework to Next.js 16.4.1 to resolve the critical advisories reported during release verification.

## 1.2.2 — 2026-10-18

- Offer smaller, clearly labelled 32-bit and 64-bit ARM installers for Android 10 or newer.
- Refuse packaging a release that is missing either supported ARM installer.
- Preserve existing app features, audio quality and update signing; each installer contains only its matching native architecture.

## 1.2.1 — 2026-10-18

- Add “Made by Med Gleiguem” to the mobile bottom bar, desktop sidebar and installer.
- Publish the application source under GPL-3.0-only.
- Add contributor setup, security reporting, issue/PR templates and automated web/Android checks.

## 1.2.0 — 2026-10-18

### Added

- Native Android background playback with Media3, system media controls and queue advancement independent of the Activity/WebView.
- Progressive staging of existing saved audio for native playback and reattachment when the app screen reopens.
- Experimental on-device YouTube stream resolution without a full-file download.

### Changed

- Cache and coalesce repeated native search lookups; a test query measured 12.18 seconds cold and 51 ms warm on an emulator.
- Pin and verify the Android extraction engine at 2026.10.10.233141.
- Bound playback retries and improve extraction/storage failure reporting and dismissed-download recovery.

### Known limitations

- YouTube refused streaming and downloading the reported “Moqawem” upload and a second short public video on the test connection. These failures remain unresolved.
- Physical A35, Bluetooth hardware and phone-call interruption are unverified. OS process-death restoration is not implemented.

See [the complete release evidence](docs/android-release-1.2.md).

## 1.1.0 — 2026-10-18

- Improve native download lifecycle, foreground playlist waiting, recovery and notification cancellation.
- Improve mobile layout, storage recovery and large-library rendering.

See [the historical release notes](docs/android-release-1.1.md). Earlier deployment records are retained in [docs/vercel-launch.md](docs/vercel-launch.md).
