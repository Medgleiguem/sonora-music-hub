# YouTube Playlists and Artists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Import full public/unlisted playlists, search playlists and artists, and play an artist's channel as an isolated queue.

**Architecture:** Extend existing search and paged playlist endpoints on Node and Android. Share normalization and import-order logic in focused modules, and reuse the current downloader, IndexedDB stores, and player queue.

**Tech Stack:** React, Next.js, Capacitor, Java, yt-dlp, IndexedDB, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-youtube-playlists-design.md`

## Global Constraints

- Public/unlisted only; no account sign-in, new services, or new dependencies.
- Metadata batches contain at most 100 source entries plus one lookahead.
- Keep per-video resource limits, Android foreground continuation, and Vercel download alternatives.
- Reuse canonical source identity and requested-format audio; retain completed work.
- Preserve source order on retry and keep artist queues within the selected channel.

## Review Focus

- Unavailable entries must not end pagination early.
- Different URL shapes for one playlist must resume the same collection.
- A retried earlier failure must return to source order.
- Switching search mode during an in-flight request must not show stale results.
- Starting artist playback while one of its songs already plays must replace the old queue.

### Task 1: Catalog contracts and playlist import ordering

**Files:** create `lib/youtube-catalog.mjs`, `src/playlist-import.mjs`, `tests/youtube-catalog.test.mjs`, `tests/playlist-import.test.mjs`.

**Interfaces:** `searchType(value)` validates `video|playlist|artist`; `playlistStart(value)` validates positive safe source positions; `searchSource(term,type)` builds extractor input; `catalogEntries(data,type)` normalizes results; `playlistBatch(data,{start,limit,sourceUrl})` returns `{title,entries,nextStart,total,sourceUrl}`. `mergeImportedTrack(playlist,track,entry)` keeps imported references deduplicated and source ordered.

- [x] Write Node tests asserting video defaults, invalid type/start rejection, playlist/channel results, unavailable lookahead, terminal pages, canonical identity, source-order retry and format replacement.
- [x] Run `node --test tests/youtube-catalog.test.mjs tests/playlist-import.test.mjs`; expect failures for missing implementations.
- [x] Implement contracts and the minimal ordering metadata, with no DB schema migration.
- [x] Run the same tests; expect all pass.

### Task 2: Server and Android discovery and pagination

**Files:** modify `lib/media.mjs`, `app/api/youtube/search/route.js`, `app/api/youtube/playlist/route.js`, `src/native-media.mjs`, Android `NativeMedia.java` and `SonoraMediaPlugin.java`; add `tests/youtube-discovery.test.mjs` and Android contract tests.

**Interfaces:** search accepts `type`; playlist accepts `start`; native bridge carries those exact values. Existing video callers retain their contract. Playlist metadata includes explicit `nextStart` and optional `total`; Android cache keys include type and source position.

- [x] Add route tests with stubbed extraction and API fetches for typed search, input validation, pagination beyond 100 and unavailable source entries.
- [x] Run `node --test tests/youtube-discovery.test.mjs`; expect missing-contract failures.
- [x] Implement Node routes and native parity, preserving validation/cancellation and bounded subprocess output.
- [x] Run discovery and existing input/route tests; expect all pass. Compile Android and run available JVM tests after UI bundle generation.

### Task 3: Playlist import UI and artist queue

**Files:** modify `src/App.jsx`, `src/styles.css`; create `src/CatalogCollectionCard.jsx`; add `tests/browser/collections.spec.js`.

**Interfaces:** discovery supports Songs/Playlists/Artists; collection cards open a prefilled download dialog or artist channel view. Downloader processes `nextStart` batches and uses `mergeImportedTrack`. Artist playback starts through `startPlayback(artistTracks,shuffleMode)` and explicitly replaces the queue.

- [x] Add browser regressions for playlist search and URL prefill, artist opening/play/next/repeat, stale search cancellation, multi-batch import, retry/order, and preserving completed downloads on cancellation.
- [x] Run new browser tests against the unchanged app; expect absent controls/contracts to fail.
- [x] Implement accessible discovery controls and cards, artist loading/error states, bounded upload loading, and sequential full-playlist downloads.
- [x] Run new collection tests plus existing stability/mobile regressions; expect all pass. Inspect screenshots at phone/desktop widths and check runtime errors.

### Task 4: Integration verification and review

**Files:** update `README.md`, `CHANGELOG.md`; implementation ledger in `/tmp/sonora-playlists-progress.md`.

- [x] Document search/import/artist behavior and precise upstream/platform limitations.
- [x] Run `npm test`, `npm run build`, `npm run build:mobile`, and relevant browser tests; expect success.
- [x] Run Android compilation/JVM tests with the installed SDK/JDK; record any environment blocker accurately.
- [x] Get one fresh read-only review of all changes, fix important issues with regression coverage, and report verified results and limits.

## Execution notes

The user approved implementation; execute inline without another approval round. Sandbox prevents `.git` writes, so changes remain in the current checkout without commits. Use the ledger to preserve task progress and decisions.
