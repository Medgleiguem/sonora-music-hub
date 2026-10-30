# YouTube playlist import and discovery

Status: approved by the user on 2026-10-26, with artist discovery and artist-only playback added in the approval message.

## Intent

Let someone bring a public or unlisted YouTube playlist into Sonora by pasting its URL, or find a public playlist through search and download it. Create a named local playlist containing the downloaded audio, ready for offline listening.

## Existing behavior

The shared React app already recognizes playlist URLs in its download dialog, downloads songs sequentially, and saves completed songs into an IndexedDB playlist. Both the Next.js server and Android native extractor support playlist lookup, but stop at 100 entries. Search currently returns only videos. The public Vercel website directs download requests to the Android app because conversion is unavailable on that host.

## Goals and constraints

- Support public and unlisted playlist links, including video links with a playlist ID.
- Add public playlist search alongside the existing song search.
- Continue past 100 playlist entries using bounded metadata batches, rather than imposing a 100-song total limit.
- Preserve source order among downloaded songs, including after a failed song is retried.
- Keep completed work when a download fails or is cancelled, and skip audio already saved in the requested format on retry.
- Reuse the existing React, IndexedDB, native Android, and Node download paths. No new service, subscription, or account system.
- Retain current per-video duration, file-size, conversion-time, concurrency, and storage safeguards. "Download all" means attempt all available entries; it does not guarantee that YouTube permits every download.

Private playlists, account sign-in, cross-device sync, playlist synchronization after import, and a new background download engine are outside this change. Android retains its current behavior: the current song can finish in the background; remaining songs continue when Sonora returns to the foreground. The Vercel website retains its existing Android download alternative.

## Approaches

1. **Extend the existing importer (recommended).** Add playlist discovery and paged lookup to the existing download pipeline. This reuses storage, audio conversion, progress, cancellation, and recovery behavior, and keeps Android and browser libraries consistent.
2. **Build a separate playlist importer.** This could support a distinct preview and song-selection workflow, but would duplicate download state and recovery logic. Neither preview nor selective import is required by the request, so this adds maintenance without a current benefit.

The implementation uses approach 1, approved by the user.

## Artist discovery addition

Add an Artists search mode beside Songs and Playlists. Opening an artist shows that channel's available uploads, with Play artist, Shuffle, and Repeat artist controls. Starting artist playback replaces the queue with the displayed artist's songs; automatic next/repeat never adds unrelated recommendations. The user confirmed the artist's YouTube channel as the source, rather than broad name matches; show that source clearly because channel uploads can include performances and other material. Support loading more uploads before starting a longer queue. Keep existing platform playback limits visible. This addition uses channel search and the channel's uploads playlist, with the same bounded lookup path and no account system.

## User experience

- Add a visible **Import YouTube playlist** action near playlist creation that opens the existing download dialog with playlist-specific guidance. Keep the existing general download entry points working.
- Within YouTube discovery, add a **Songs / Playlists** switch. Keep song search as the default and keep Arabic classics and Jamendo searches unchanged.
- Playlist results show the playlist title, creator, cover when available, and a **Download playlist** action. Show a song count only when supplied by the source. Playlist cards do not use song playback controls.
- Downloading a search result opens the same dialog with its playlist URL filled in. The user chooses an existing audio format and starts the download using the existing confirmation controls.
- Use the source playlist title for the local collection. Create and persist that collection when the first song is saved or reused, and update it after every successful addition.
- Show saved/processed counts, current song, and failures. If the total is unknown, say so rather than showing a misleading finished percentage. Completion is reported only after the last metadata batch has been processed.

## Search and lookup contracts

- Extend `/api/youtube/search` with a validated result type, defaulting to videos for existing callers. Native bridge search receives the same distinction.
- Return playlist results with a distinct type, stable playlist ID, title, creator, canonical playlist URL, optional cover, and optional song count. Keep the current video result contract intact.
- With a server API key, use YouTube Data API playlist search. Without a key, and on Android, use yt-dlp's filtered YouTube search URL support. Construct upstream search URLs from validated text; never accept arbitrary extractor arguments or hosts.
- Extend `/api/youtube/playlist` and native lookup with a validated batch position. Metadata calls stay bounded to at most 100 entries plus any lookahead needed to detect another batch.
- Return the canonical playlist URL, title, normalized available entries, and an explicit next batch position or end marker. Derive continuation from source positions, not from the count remaining after unavailable entries are filtered; an unavailable batch must not prematurely end the import.
- Make the Android metadata cache distinguish song search, playlist search, and each playlist batch. Preserve its current bounded size, expiry, and cancellation isolation.

## Download and persistence behavior

- Canonicalize the playlist URL before identity matching, so alternate links to the same playlist resume the same imported collection.
- Fetch and process batches sequentially until the explicit end marker. Do not load the entire metadata list before saving the first song.
- Reuse saved YouTube audio by video ID and requested file format. Deduplicate repeated videos within a local playlist, preserving first appearance.
- Builder default: importing the same source in a different format updates that same local playlist. As each conversion succeeds, replace that video's imported playlist reference with the requested-format track. Keep previous audio in the library and any other playlists. A failed conversion leaves the previously saved playlist reference intact. This avoids duplicate songs and duplicate collections without deleting existing audio.
- Maintain source order when merging successful songs into an existing import, including filling earlier gaps on retry. Do not remove other library audio or unrelated playlist songs.
- Continue after individual download failures. Stop on cancellation, metadata lookup failure, or exhausted storage; report incomplete work and retain saved songs. Retry starts enumeration again and reuses completed audio.
- Persist playlist changes as songs succeed. Keep the existing Android interrupted-request recovery path compatible with the canonical request URL.
- If YouTube changes the playlist during an import or between retries, use the order observed during the current enumeration; this feature does not provide a remote playlist snapshot or ongoing synchronization.

## Verification

- Node tests for search type validation, playlist result normalization, bounded batching and continuation, canonical identity, and invalid input rejection. Stub upstream extraction and API responses where needed.
- Browser regression tests for URL import, playlist search and opening its download dialog, processing more than 100 entries, skipping saved audio on retry, source ordering after partial failure, cancellation preserving completed songs, and unchanged song search.
- Exercise Android bridge result type and batch arguments with deterministic fixtures. Compile changed Android code and run available JVM tests; use device/emulator checks if an environment is available.
- Run the existing relevant download regressions and production web/mobile builds. Report live YouTube access separately from fixture-based behavior; passing stubbed tests does not prove live downloads succeed.

## Builder decisions

The builder may choose component boundaries, the validated search parameter spelling, batch-position representation, and the smallest source-order metadata needed for safe retries. Avoid unrelated UI changes, new dependencies, and database schema migrations unless implementation evidence makes one necessary.

## References

- [YouTube playlist search](https://developers.google.com/youtube/v3/guides/implementation/search)
- [YouTube search parameters](https://developers.google.com/youtube/v3/docs/search/list)
- [yt-dlp supported search and playlist extractors](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)
- [yt-dlp options](https://github.com/yt-dlp/yt-dlp#usage-and-options)
