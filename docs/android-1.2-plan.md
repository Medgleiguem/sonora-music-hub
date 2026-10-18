# Android 1.2 background playback and download reliability

User authorization: implement the discussed on-device streaming approach, improve failing downloads and search, verify it, and update the deployment. Example failure: Julia Boutros, “Moqawem” (المقاوم).

## Design

Keep the existing React interface, browser behavior and library. Android gets a Media3 player inside a mediaPlayback foreground service. The service owns the queue, position, repeat/shuffle and resolving work independently of the WebView. A small Capacitor plugin supplies commands and state events. Existing IndexedDB audio is copied in bounded chunks into private native files for playback without deleting the original library. New streaming requests resolve audio on the phone, without a full-file download or conversion. No paid API, cloud conversion worker, extracted credentials, or undocumented promise of official YouTube support.

Shared resolver contract: `NativeMedia.resolve(String youtubeUrl, MediaProcess process)` returns `{url, headers, mime, title, duration}`. It accepts canonical YouTube URLs, returns HTTPS media URLs with allowlisted hosts and scoped headers, and enforces a deadline. Downloads use the same maintained extraction logic. Upstream refusals remain explicit failures, not claimed successes. Do not retry bot checks indefinitely.

Player bridge `SonoraPlayer`: `setQueue({items,index,position})`, `play`, `pause`, `next`, `previous`, `seek({position})`, `setOptions({repeat,shuffle,volume,muted})`, `state`; event `state` includes `{currentId,index,playing,buffering,position,duration,error,items}`. Items contain `{id,title,artist,album,cover,source,externalId,uri}`. Source youtube resolves on demand; other sources use validated HTTPS streams or private native file URIs. Seconds are used at the bridge boundary. `stageStart({id,size})`, `stageChunk({uploadId,data})`, `stageFinish({uploadId})` copy existing Blobs in bounded chunks; incomplete stages never become playable. Queue items retain metadata only, never audio blobs.

## Tasks

- [x] Pin and verify a maintained extraction engine; reproduce Julia Boutros lookup/download failures; add resolver/error tests and bounded search cache/coalescing. Preserve URL, file-size, deadline and cancellation bounds.
- [x] Implement Media3 service/plugin, native file staging, queue, notification controls, audio focus/headphone handling, and state recovery. Verify HTTP/local playback independently of YouTube availability.
- [x] Integrate Android UI controls and native queue events; prevent simultaneous WebView/native audio. Reattach on foreground/recreation, retain all browser playback behavior, and show resolver/buffering errors. Cache search metadata without caching aborted or failed results.
- [x] Test real playback with Home/screen-off, queue advancement, notification pause/seek, Activity recreation, and existing offline library. Test the named song and real download formats. Separate deterministic native-player tests from live YouTube results.
- [x] Review integrated changes, build same-key signed version 1.2.0/code 3, package protected installer/source/checksums, stage and verify the full website, promote, and check public links. Preserve previous deployments for rollback.

- [ ] Resolve live YouTube refusals for the named song. Both streaming and downloading still failed on the emulator connection; this remains unresolved and is not a release success claim.

## Review focus

Rapid track changes must cancel or ignore stale resolutions. Native queues must advance without JavaScript. Existing blobs must survive failed staging. Reopening must not reset ongoing playback. Force-stop must stop playback. Signed stream URLs must not be logged or treated as permanent. A YouTube refusal must not be mislabeled as a working stream or silently substituted with another song.

## Execution notes

Implement independent native engine and native player components in parallel with explicit file ownership; integrate the JavaScript bridge in the main session. The user has authorized implementation and deployment; no repeated design-approval handoff. Preserve the pre-existing uncommitted project work and do not create a catch-all commit.
