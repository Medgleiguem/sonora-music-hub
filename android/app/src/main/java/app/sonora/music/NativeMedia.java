package app.sonora.music;

import android.content.Context;
import android.net.Uri;
import android.media.MediaMetadataRetriever;
import android.os.SystemClock;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.ffmpeg.FFmpeg;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.function.Consumer;
import java.util.function.LongSupplier;
import java.util.function.ToLongFunction;
import java.util.concurrent.*;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

final class NativeMedia {
    static final long MAX_AUDIO_BYTES = 64L * 1024 * 1024;
    static final long STREAM_TTL_MS = 30 * 60_000;
    private final Context context;
    private final File root;
    private static final Object ENGINE_LOCK = new Object();
    private static final ExecutorService STREAM_WORKERS = Executors.newFixedThreadPool(2);
    private boolean initialized;
    private final LookupCache lookups = new LookupCache(this::lookupUncached, SystemClock::elapsedRealtime);
    private final LookupCache streams = streamCache((query, playlist, process) -> resolveUncached(query, process), SystemClock::elapsedRealtime);

    static LookupCache streamCache(LookupLoader loader, LongSupplier clock) {
        return new LookupCache(loader, clock, 4, NativeMedia::streamTtlMillis, STREAM_WORKERS);
    }

    NativeMedia(Context context) {
        this.context = context.getApplicationContext();
        root = new File(context.getCacheDir(), "sonora-downloads");
    }

    synchronized void init() throws Exception {
        synchronized (ENGINE_LOCK) {
            if (initialized) return;
            YoutubeDL.getInstance().init(context);
            FFmpeg.getInstance().init(context);
            // Library init only installs its bundled 2025 engine on a fresh install.
            // Replace it on upgrades as well, without discarding the user's library.
            File engine = engine();
            File version = new File(engine.getParentFile(), "version.json");
            byte[] expected;
            try (InputStream input = context.getAssets().open("downloader/version.json"); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[1024];
                int count;
                while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
                expected = bytes.toByteArray();
            }
            if (!engine.isFile() || !version.isFile() || !Arrays.equals(expected, Files.readAllBytes(version.toPath()))) {
                engine.getParentFile().mkdirs();
                File temporary = new File(engine.getParentFile(), "yt-dlp.tmp");
                try (InputStream input = context.getAssets().open("downloader/yt-dlp")) {
                    Files.copy(input, temporary.toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
                Files.move(temporary.toPath(), engine.toPath(), StandardCopyOption.REPLACE_EXISTING);
                Files.write(version.toPath(), expected);
            }
            root.mkdirs();
            initialized = true;
        }
    }

    private File engine() { return new File(context.getNoBackupFilesDir(), "sonora-engine/yt-dlp"); }

    void clearOldFiles() { delete(root); }

    static String source(String value, boolean playlist) {
        if (value == null || value.length() > 2048) throw new IllegalArgumentException("Paste a valid YouTube URL.");
        Uri uri = Uri.parse(value);
        List<String> hosts = Arrays.asList("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be");
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null || !hosts.contains(uri.getHost()) || uri.getUserInfo() != null || uri.getPort() != -1)
            throw new IllegalArgumentException("Paste a valid YouTube URL.");
        if (playlist) {
            String id = uri.getQueryParameter("list");
            if (id == null || !id.matches("[A-Za-z0-9_-]{10,100}")) throw new IllegalArgumentException("Paste a valid YouTube playlist URL.");
            return "https://www.youtube.com/playlist?list=" + id;
        }
        List<String> path = uri.getPathSegments();
        String id = "youtu.be".equals(uri.getHost()) && !path.isEmpty() ? path.get(0)
            : "/watch".equals(uri.getPath()) ? uri.getQueryParameter("v")
            : path.size() > 1 && Arrays.asList("shorts", "embed", "live").contains(path.get(0)) ? path.get(1) : null;
        if (id == null || !id.matches("[A-Za-z0-9_-]{11}")) throw new IllegalArgumentException("Paste a valid YouTube video URL.");
        return "https://www.youtube.com/watch?v=" + id;
    }

    private static String mixSeed(String canonical) {
        String id = Uri.parse(canonical).getQueryParameter("list");
        return id != null && id.matches("RD[A-Za-z0-9_-]{11}") ? id.substring(2) : null;
    }

    static String playlistExtractionSource(String value) {
        String canonical = source(value, true);
        String seed = mixSeed(canonical);
        return seed == null ? canonical : "https://www.youtube.com/watch?v=" + seed + "&list=RD" + seed;
    }

    ProcessBuilder command(List<String> args) {
        File binaries = new File(context.getApplicationInfo().nativeLibraryDir);
        String python = new File(binaries, "libpython.so").getAbsolutePath();
        // A session gives this job its own process group without invoking a shell.
        String bootstrap = "import os,sys; os.setsid(); print('SONORA_PID='+str(os.getpid()),file=sys.stderr,flush=True); os.execv(sys.executable,[sys.executable,*sys.argv[1:]])";
        List<String> command = new ArrayList<>(Arrays.asList(python, "-c", bootstrap, engine().getAbsolutePath(),
            "--ignore-config", "--no-cache-dir", "--no-warnings", "--socket-timeout", "15", "--retries", "1", "--fragment-retries", "1", "--extractor-retries", "1", "--file-access-retries", "0",
            "--js-runtimes", "quickjs:" + new File(binaries, "libqjs.so"), "--ffmpeg-location", new File(binaries, "libffmpeg.so").getAbsolutePath()));
        command.addAll(args);
        return environment(new ProcessBuilder(command));
    }

    /** FFmpeg alone, for remuxing or encoding a source fetched without the extractor. */
    ProcessBuilder ffmpeg(List<String> args) {
        List<String> command = new ArrayList<>(Arrays.asList(new File(context.getApplicationInfo().nativeLibraryDir, "libffmpeg.so").getAbsolutePath(),
            "-nostdin", "-hide_banner", "-loglevel", "error", "-y"));
        command.addAll(args);
        return environment(new ProcessBuilder(command));
    }

    private ProcessBuilder environment(ProcessBuilder builder) {
        File binaries = new File(context.getApplicationInfo().nativeLibraryDir);
        File packages = new File(new File(context.getNoBackupFilesDir(), "youtubedl-android"), "packages");
        Map<String, String> env = builder.environment();
        env.put("LD_LIBRARY_PATH", new File(packages, "python/usr/lib") + ":" + new File(packages, "ffmpeg/usr/lib"));
        env.put("SSL_CERT_FILE", new File(packages, "python/usr/etc/tls/cert.pem").getAbsolutePath());
        env.put("PYTHONHOME", new File(packages, "python/usr").getAbsolutePath());
        env.put("TMPDIR", context.getCacheDir().getAbsolutePath());
        env.put("PATH", env.getOrDefault("PATH", "/system/bin") + ":" + binaries);
        return builder;
    }

    JSONObject lookup(String input, boolean playlist, MediaProcess process) throws Exception {
        return lookup(input, playlist, "video", 1, process);
    }

    JSONObject lookup(String input, boolean playlist, String type, long start, MediaProcess process) throws Exception {
        return lookups.get(lookupRequest(input, playlist, type, start).toString(), playlist, process);
    }

    static JSONObject lookupRequest(String input, boolean playlist, String type, long start) throws JSONException {
        if (!Arrays.asList("video", "playlist", "artist").contains(type)) throw new IllegalArgumentException("Choose Songs, Playlists, or Artists.");
        if (start < 1 || start > 2147483546L) throw new IllegalArgumentException("Choose a valid playlist position.");
        String query;
        if (playlist) query = source(input, true);
        else {
            if (input == null || input.length() > 200 || input.indexOf('\0') >= 0) throw new IllegalArgumentException("Enter a search of up to 200 characters.");
            String term = input.trim().isEmpty() ? "popular music" : input.trim();
            query = "video".equals(type) ? "ytsearch24:" + term : new Uri.Builder().scheme("https").authority("www.youtube.com").path("results")
                .appendQueryParameter("search_query", term).appendQueryParameter("sp", "playlist".equals(type) ? "EgIQAw==" : "EgIQAg==").build().toString();
        }
        // Structured identity keeps every result type and metadata page in its own cache entry.
        return new JSONObject().put("query", query).put("type", type).put("start", start);
    }

    private JSONObject lookupUncached(String encoded, boolean playlist, MediaProcess process) throws Exception {
        process.checkCancelled();
        JSONObject request = new JSONObject(encoded);
        String query = request.getString("query");
        int start = request.getInt("start");
        boolean mix = playlist && mixSeed(query) != null;
        if (mix && start > 100) return lookupResult(new JSONObject(), true, "video", start, 100, query);
        long started = SystemClock.elapsedRealtime();
        if (!playlist) {
            try {
                String term = query.startsWith("ytsearch24:") ? query.substring("ytsearch24:".length()) : Uri.parse(query).getQueryParameter("search_query");
                JSONObject data = new YoutubeSearch().search(term, request.getString("type"), process);
                return lookupResult(data, false, request.getString("type"), 1, 24, query).put("lookupBackend", "native");
            } catch (Exception unsupported) { process.checkCancelled(); /* Preserve extraction compatibility on unsupported page layouts. */ }
        }
        init();
        long remaining = 50_000 - (SystemClock.elapsedRealtime() - started);
        if (remaining <= 0) throw new IOException("Search timed out. Please retry.");
        String output = process.run(command(Arrays.asList("--flat-playlist", "--playlist-start", String.valueOf(start), "--playlist-end", playlist ? String.valueOf(mix ? Math.min(start + 100, 101) : start + 100) : "24", "--dump-single-json", "--skip-download", "--", playlist ? playlistExtractionSource(query) : query)), remaining, null, line -> {});
        return lookupResult(new JSONObject(output), playlist, request.getString("type"), start, playlist ? 100 : 24, query).put("lookupBackend", "extractor");
    }

    static JSONObject lookupResult(JSONObject data, boolean playlist, String type, int start, int limit, String query) throws JSONException {
        boolean mix = playlist && mixSeed(query) != null;
        if (mix) limit = Math.max(0, Math.min(limit, 101 - start));
        JSONArray items = data.optJSONArray("entries");
        JSONArray entries = new JSONArray();
        if (items != null) for (int i = 0; i < Math.min(items.length(), limit); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            String id = item.optString("id");
            boolean collection = !playlist && !"video".equals(type);
            if (!id.matches(collection ? "artist".equals(type) ? "UC[A-Za-z0-9_-]{22}" : "[A-Za-z0-9_-]{10,100}" : "[A-Za-z0-9_-]{11}")) continue;
            if (collection && "playlist".equals(type) && (id.length() == 11 || id.matches("UC[A-Za-z0-9_-]{22}"))) continue;
            JSONObject result = new JSONObject().put("id", "youtube-" + (collection ? type + "-" : "") + id).put("externalId", id)
                .put("title", item.optString("title", item.optString("channel", "Untitled")))
                .put("artist", item.optString("channel", item.optString("uploader", "YouTube"))).put("source", "youtube");
            if (collection) {
                String cover = item.optString("thumbnail", "");
                JSONArray thumbs = item.optJSONArray("thumbnails");
                if (thumbs != null) for (int j = 0; j < thumbs.length(); j++) {
                    JSONObject thumb = thumbs.optJSONObject(j);
                    if (thumb != null && thumb.optString("url").startsWith("https://")) cover = thumb.optString("url");
                }
                result.put("kind", type).put("cover", cover);
                if ("artist".equals(type)) result.put("shareUrl", "https://www.youtube.com/channel/" + id)
                    .put("uploadsUrl", "https://www.youtube.com/playlist?list=UU" + id.substring(2));
                else result.put("shareUrl", "https://www.youtube.com/playlist?list=" + id)
                    .put("trackCount", item.has("playlist_count") && item.optLong("playlist_count", -1) >= 0 ? item.get("playlist_count") : JSONObject.NULL);
            } else {
                result.put("album", data.optString("title", "YouTube")).put("duration", item.optDouble("duration", 0))
                    .put("cover", "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg").put("shareUrl", "https://www.youtube.com/watch?v=" + id).put("playlistIndex", start + i);
            }
            entries.put(result);
        }
        return playlist ? new JSONObject().put("title", data.optString("title", "YouTube playlist")).put("entries", entries)
            .put("sourceUrl", query).put("nextStart", items != null && items.length() > limit && (!mix || start + limit <= 100) ? start + limit : JSONObject.NULL)
            .put("total", !mix && data.has("playlist_count") && data.optLong("playlist_count", -1) >= 0 ? data.get("playlist_count") : JSONObject.NULL).put("limited", mix)
            : new JSONObject().put("results", entries);
    }

    /** Successful resolutions stay briefly in private process memory, never queue state, disk, or logs. */
    JSONObject resolve(String youtubeUrl, MediaProcess process) throws Exception {
        return streams.get(source(youtubeUrl, false), false, process);
    }
    boolean hasStream(String youtubeUrl) { return streams.contains(source(youtubeUrl, false), false); }
    void invalidateStream(String youtubeUrl) { streams.invalidate(source(youtubeUrl, false), false); }

    static long streamTtlMillis(JSONObject result) {
        // Long enough for a prefetched next track to still be valid when the current one ends.
        long ttl = STREAM_TTL_MS;
        try {
            String expires = Uri.parse(result.getString("url")).getQueryParameter("expire");
            if (expires != null) ttl = Math.min(ttl, Math.multiplyExact(Long.parseLong(expires), 1000) - System.currentTimeMillis() - 30_000);
        } catch (Exception invalid) { return 0; }
        return Math.max(0, ttl);
    }

    private JSONObject resolveUncached(String url, MediaProcess process) throws Exception {
        process.checkCancelled();
        long deadline = SystemClock.elapsedRealtime() + 60_000;
        // Under a second, versus several seconds just to start the extractor on a phone.
        try { return streamResult(new YoutubeStream().resolve(Uri.parse(url).getQueryParameter("v"), process)).put("resolver", "native"); }
        catch (Exception unsupported) { process.checkCancelled(); /* The extractor below handles every other case. */ }
        init();
        // This client's addresses need no player JavaScript: no player download and no QuickJS challenge solve,
        // which dominated cold starts. Any refusal or unusable result falls back to the default clients.
        // A speculative timeout must not permanently cancel the caller before the compatibility fallback.
        MediaProcess fast = new MediaProcess();
        process.onCancel(() -> fast.cancel("Playback changed."));
        try { return resolveWith(url, Arrays.asList("--extractor-args", "youtube:player_client=visionos"),
            Math.min(10_000, PlaybackPolicy.resolutionRemaining(deadline, SystemClock.elapsedRealtime())), fast).put("resolver", "visionos"); }
        catch (Exception fastFailure) { process.checkCancelled(); }
        finally { process.onCancel(null); }
        return resolveFallback(url, process, deadline);
    }

    JSONObject resolveFallback(String url, MediaProcess process, long deadline) throws Exception {
        process.checkCancelled();
        String canonical = source(url, false);
        PlaybackPolicy.resolutionRemaining(deadline, SystemClock.elapsedRealtime());
        init();
        return resolveWith(canonical, Collections.emptyList(), PlaybackPolicy.resolutionRemaining(deadline, SystemClock.elapsedRealtime()), process)
            .put("resolver", "extractor");
    }

    private JSONObject resolveWith(String url, List<String> client, long timeoutMs, MediaProcess process) throws Exception {
        List<String> args = new ArrayList<>(client);
        args.addAll(Arrays.asList("--no-playlist", "--skip-download", "--dump-single-json",
            "--format", "bestaudio[protocol=https]/best[protocol=https][acodec!=none]", "--", url));
        String output = process.run(command(args), timeoutMs, null, line -> {});
        process.checkCancelled();
        try { return streamResult(new JSONObject(output)); }
        catch (JSONException invalid) { throw new IOException("YouTube returned invalid stream information. Retry or update Sonora."); }
    }

    static JSONObject streamResult(JSONObject data) throws Exception {
        if (data.optBoolean("is_live") || "none".equals(data.optString("acodec", "none")))
            throw new IOException("Choose a finished video with an audio track.");
        URI uri;
        try { uri = new URI(data.optString("url")); }
        catch (Exception invalid) { throw new IOException("YouTube returned an invalid media address. Retry or update Sonora."); }
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null || !host.endsWith(".googlevideo.com")
            || !host.matches("[A-Za-z0-9.-]+") || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)
            || !"/videoplayback".equals(uri.getPath()) || uri.getFragment() != null || data.optString("url").length() > 32768)
            throw new IOException("YouTube returned an unsupported media address. Retry or update Sonora.");
        JSONObject headers = new JSONObject();
        JSONObject incoming = data.optJSONObject("http_headers");
        if (incoming != null) for (Iterator<String> keys = incoming.keys(); keys.hasNext();) {
            String key = keys.next();
            String lower = key.toLowerCase(Locale.ROOT);
            if (!Arrays.asList("user-agent", "accept", "accept-language", "referer", "origin").contains(lower)) continue;
            String value = incoming.optString(key);
            if (value.length() > 2048 || !value.matches("[\\x20-\\x7E]*"))
                throw new IOException("YouTube returned invalid media headers. Retry or update Sonora.");
            if ("referer".equals(lower) || "origin".equals(lower)) {
                try {
                    URI scope = new URI(value);
                    if (!"https".equals(scope.getScheme()) || !Arrays.asList("www.youtube.com", "youtube.com", "music.youtube.com").contains(scope.getHost())
                        || scope.getUserInfo() != null || scope.getPort() != -1 || scope.getFragment() != null)
                        throw new IllegalArgumentException();
                } catch (Exception invalid) { throw new IOException("YouTube returned invalid media headers. Retry or update Sonora."); }
            }
            headers.put(key, value);
        }
        String ext = data.optString("ext");
        String mime = "m4a".equals(ext) || "mp4".equals(ext) ? "audio/mp4"
            : "webm".equals(ext) ? "audio/webm" : "opus".equals(ext) || "ogg".equals(ext) ? "audio/ogg" : null;
        if (mime == null) throw new IOException("YouTube returned an unsupported audio format. Update Sonora and retry.");
        double duration = data.optDouble("duration", 0);
        return new JSONObject().put("url", uri.toASCIIString()).put("headers", headers).put("mime", mime)
            .put("title", data.optString("title", "YouTube audio").substring(0, Math.min(180, data.optString("title", "YouTube audio").length())))
            .put("duration", Double.isFinite(duration) && duration > 0 ? duration : 0);
    }

    @FunctionalInterface interface LookupLoader {
        JSONObject load(String query, boolean playlist, MediaProcess process) throws Exception;
    }

    /** Private, bounded lookup cache. Each caller owns its cancellation; failures are never cached. */
    static final class LookupCache {
        private static final ExecutorService WORKERS = Executors.newFixedThreadPool(2);
        private final LookupLoader loader;
        private final LongSupplier clock;
        private final int maxEntries;
        private final ToLongFunction<JSONObject> lifetime;
        private final ExecutorService workers;
        private final LinkedHashMap<String, CacheEntry> cache = new LinkedHashMap<>(32, .75f, true);
        private final Map<String, Flight> flights = new HashMap<>();
        LookupCache(LookupLoader loader, LongSupplier clock) { this(loader, clock, 24, value -> 120_000); }
        LookupCache(LookupLoader loader, LongSupplier clock, int maxEntries, ToLongFunction<JSONObject> lifetime) {
            this(loader, clock, maxEntries, lifetime, WORKERS);
        }
        LookupCache(LookupLoader loader, LongSupplier clock, int maxEntries, ToLongFunction<JSONObject> lifetime, ExecutorService workers) {
            this.loader = loader; this.clock = clock; this.maxEntries = maxEntries; this.lifetime = lifetime; this.workers = workers;
        }
        private static String key(String query, boolean playlist) { return (playlist ? "playlist:" : "search:") + query; }
        synchronized int subscribers(String query, boolean playlist) {
            Flight flight = flights.get(key(query, playlist)); return flight == null ? 0 : flight.subscribers;
        }
        synchronized boolean contains(String query, boolean playlist) {
            CacheEntry entry = cache.get(key(query, playlist));
            return entry != null && clock.getAsLong() < entry.expiresAt;
        }
        synchronized void invalidate(String query, boolean playlist) { cache.remove(key(query, playlist)); }
        JSONObject get(String query, boolean playlist, MediaProcess caller) throws Exception {
            caller.checkCancelled();
            String key = key(query, playlist);
            Flight flight;
            synchronized (this) {
                cache.entrySet().removeIf(entry -> clock.getAsLong() >= entry.getValue().expiresAt);
                CacheEntry hit = cache.get(key);
                if (hit != null) return new JSONObject(hit.json);
                flight = flights.get(key);
                if (flight == null) {
                    // Cancelled callers release their flight only on their next poll; don't let that window refuse new work.
                    flights.values().removeIf(stale -> {
                        boolean abandoned = stale.callers.stream().allMatch(MediaProcess::isCancelled);
                        if (abandoned) stale.process.cancel("Search cancelled.");
                        return abandoned;
                    });
                    if (flights.size() >= 2) throw new IOException("Search is busy. Wait a moment and retry.");
                    flight = new Flight();
                    flights.put(key, flight);
                    Flight job = flight;
                    workers.execute(() -> {
                        try {
                            JSONObject value = loader.load(query, playlist, job.process);
                            String result = value.toString();
                            job.process.checkCancelled();
                            synchronized (LookupCache.this) {
                                if (flights.get(key) == job && job.callers.stream().anyMatch(subscriber -> !subscriber.isCancelled())) {
                                    long ttl = Math.max(0, Math.min(STREAM_TTL_MS, lifetime.applyAsLong(value)));
                                    if (ttl > 0) cache.put(key, new CacheEntry(result, clock.getAsLong() + ttl));
                                    while (cache.size() > maxEntries) cache.remove(cache.keySet().iterator().next());
                                }
                            }
                            job.result.complete(result);
                        } catch (Exception error) { job.result.completeExceptionally(error); }
                    });
                }
                flight.subscribers++;
                flight.callers.add(caller);
            }
            try {
                while (true) {
                    caller.checkCancelled();
                    try {
                        String result = flight.result.get(100, TimeUnit.MILLISECONDS);
                        caller.checkCancelled();
                        return new JSONObject(result);
                    } catch (TimeoutException waiting) { /* Cancellation is polled without killing another subscriber. */ }
                    catch (ExecutionException error) {
                        if (error.getCause() instanceof Exception) throw (Exception) error.getCause();
                        throw new IOException("Could not complete this search. Please retry.");
                    }
                }
            } finally {
                synchronized (this) {
                    flight.callers.remove(caller);
                    if (--flight.subscribers == 0) {
                        flights.remove(key, flight);
                        if (!flight.result.isDone()) flight.process.cancel("Search cancelled.");
                    }
                }
            }
        }
        private static final class CacheEntry {
            final String json; final long expiresAt;
            CacheEntry(String json, long expiresAt) { this.json = json; this.expiresAt = expiresAt; }
        }
        private static final class Flight {
            final MediaProcess process = new MediaProcess();
            final CompletableFuture<String> result = new CompletableFuture<>();
            int subscribers;
            final Set<MediaProcess> callers = new HashSet<>();
        }
    }

    static void validateAudio(File audio) throws IOException {
        if (!audio.isFile() || audio.length() == 0) throw new IOException("No audio was saved. Choose a finished video of 30 minutes or less.");
        if (audio.length() > MAX_AUDIO_BYTES) throw new IOException("The converted audio is too large (maximum 64 MiB). Choose a shorter video.");
        try (MediaMetadataRetriever metadata = new MediaMetadataRetriever()) {
            metadata.setDataSource(audio.getAbsolutePath());
            String hasAudio = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO);
            long duration = Long.parseLong(metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
            if (!"yes".equals(hasAudio) || duration <= 0 || duration > 1_805_000) throw new IllegalArgumentException();
        } catch (Exception invalid) { throw new IOException("The saved file could not be decoded as audio. Retry or choose another video."); }
    }

    JSONObject download(String input, String format, String id, MediaProcess process, Consumer<JSONObject> progress) throws Exception {
        String url = source(input, false);
        if (!Arrays.asList("mp3", "m4a", "opus").contains(format)) throw new IllegalArgumentException("Choose MP3, M4A, or Opus.");
        stage(progress, "preparing");
        init();
        File directory = folder(id);
        directory.mkdirs();
        boolean complete = false;
        try {
            try {
                JSONObject result = fastDownload(url, format, directory, process, progress);
                complete = true;
                return result;
            } catch (Exception unsupported) {
                process.checkCancelled();
                // The extractor would refuse these too; anything else gets its full compatibility path.
                if (unsupported instanceof MediaProcess.Failure && Arrays.asList("VIDEO_LIMIT", "FILE_TOO_LARGE").contains(((MediaProcess.Failure) unsupported).code)) throw unsupported;
                if (BuildConfig.DEBUG) android.util.Log.i("SonoraDownloader", "Direct download unavailable; using the extractor", unsupported);
                File[] partial = directory.listFiles();
                if (partial != null) for (File file : partial) delete(file);
            }
            stage(progress, "preparing");
            List<String> args = Arrays.asList("--no-playlist", "--no-simulate", "--newline", "--progress", "--progress-delta", "0.5",
                "--progress-template", "download:SONORA_PROGRESS=%(progress.downloaded_bytes)s|%(progress.total_bytes_estimate)s",
                "--print", "before_dl:SONORA_TITLE=%(title)j", "--print", "before_dl:SONORA_DOWNLOADING%(id)s", "--print", "post_process:SONORA_CONVERTING%(id)s",
                "--format", "bestaudio/best", "--max-filesize", "96M", "--match-filters", "!is_live & duration > 0 & duration <= 1800",
                "--extract-audio", "--audio-format", format, "--audio-quality", "192K", "--postprocessor-args", "ffmpeg:-threads 1",
                "--output", new File(directory, "audio.%(ext)s").getAbsolutePath(), "--", url);
            StringBuilder title = new StringBuilder("YouTube audio");
            process.run(command(args).directory(directory), 260_000, directory, line -> {
                try {
                    if (line.startsWith("SONORA_TITLE=")) { title.setLength(0); title.append(new JSONTokener(line.substring(13)).nextValue()); }
                    else if (line.startsWith("SONORA_DOWNLOADING")) stage(progress, "downloading");
                    else if (line.startsWith("SONORA_CONVERTING") || line.startsWith("[ExtractAudio]")) stage(progress, "converting");
                    else if (line.startsWith("SONORA_PROGRESS=")) {
                        String[] parts = line.substring(16).split("\\|");
                        long loaded = Long.parseLong(parts[0]);
                        long total = Long.parseLong(parts[1]);
                        progress.accept(new JSONObject().put("stage", "downloading").put("loaded", loaded).put("total", Math.max(loaded, total)));
                    }
                } catch (Exception ignored) { /* Progress has no bearing on completion validation. */ }
            });
            File audio = new File(directory, "audio." + format);
            validateAudio(audio);
            complete = true;
            return new JSONObject().put("path", audio.getAbsolutePath()).put("size", audio.length()).put("title", title.substring(0, Math.min(180, title.length())))
                .put("mime", mime(format)).put("format", format).put("downloader", "extractor");
        } finally {
            if (!complete) delete(directory);
        }
    }

    static final long MAX_SOURCE_BYTES = 96L * 1024 * 1024;
    static final long RANGE_BYTES = 4L * 1024 * 1024;

    /**
     * Downloads through the native resolver and plain HTTPS ranges, avoiding an extractor start per song.
     * Matching codecs are copied rather than re-encoded, so M4A and Opus need no conversion.
     */
    private JSONObject fastDownload(String url, String format, File directory, MediaProcess process, Consumer<JSONObject> progress) throws Exception {
        String preferred = "m4a".equals(format) ? "audio/mp4" : "opus".equals(format) ? "audio/webm" : null;
        JSONObject raw = new YoutubeStream().resolve(Uri.parse(url).getQueryParameter("v"), preferred, process);
        JSONObject stream = streamResult(raw);
        double duration = stream.optDouble("duration", 0);
        if (!(duration > 0) || duration > 1800) throw new MediaProcess.Failure("does not pass filter");
        if (raw.optLong("filesize", 0) > MAX_SOURCE_BYTES) throw new MediaProcess.Failure("larger than max-filesize");
        process.checkCancelled();
        init();
        stage(progress, "downloading");
        File source = new File(directory, "source");
        fetch(stream, raw.optLong("filesize", 0), source, process, progress);
        stage(progress, "converting");
        File audio = new File(directory, "audio." + format);
        List<String> args = new ArrayList<>(Arrays.asList("-i", source.getAbsolutePath(), "-vn", "-map_metadata", "-1"));
        args.addAll(audioArgs(format, raw.optString("acodec")));
        args.add(audio.getAbsolutePath());
        process.run(ffmpeg(args).directory(directory), 240_000, directory, line -> {});
        delete(source);
        validateAudio(audio);
        String title = stream.getString("title");
        return new JSONObject().put("path", audio.getAbsolutePath()).put("size", audio.length()).put("title", title)
            .put("mime", mime(format)).put("format", format).put("downloader", "native");
    }

    /** Copies a matching codec into the requested container; otherwise encodes. */
    static List<String> audioArgs(String format, String sourceCodec) {
        String codec = sourceCodec == null ? "" : sourceCodec;
        if ("m4a".equals(format)) return codec.startsWith("mp4a") ? Arrays.asList("-c:a", "copy", "-movflags", "+faststart")
            : Arrays.asList("-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart");
        if ("opus".equals(format)) return "opus".equals(codec) ? Arrays.asList("-c:a", "copy") : Arrays.asList("-c:a", "libopus", "-b:a", "128k");
        return Arrays.asList("-c:a", "libmp3lame", "-b:a", "192k");
    }

    /** The next HTTP range to request, or null once a known length is complete. Ranges keep each response short and fast. */
    static String nextRange(long loaded, long total) {
        if (total > 0 && loaded >= total) return null;
        long end = loaded + RANGE_BYTES - 1;
        return "bytes=" + loaded + "-" + (total > 0 ? Math.min(end, total - 1) : end);
    }

    static long rangeTotal(String contentRange) {
        if (contentRange == null) return 0;
        int slash = contentRange.lastIndexOf('/');
        try { return slash < 0 ? 0 : Long.parseLong(contentRange.substring(slash + 1).trim()); } catch (NumberFormatException unknown) { return 0; }
    }

    private static void fetch(JSONObject stream, long expected, File target, MediaProcess process, Consumer<JSONObject> progress) throws Exception {
        JSONObject headers = stream.getJSONObject("headers");
        long total = expected, loaded = 0, reported = 0;
        try (OutputStream output = new BufferedOutputStream(new FileOutputStream(target), 256 * 1024)) {
            for (String range; (range = nextRange(loaded, total)) != null; ) {
                java.net.HttpURLConnection connection = (java.net.HttpURLConnection) new java.net.URL(stream.getString("url")).openConnection();
                connection.setConnectTimeout(15_000); connection.setReadTimeout(15_000);
                for (Iterator<String> keys = headers.keys(); keys.hasNext();) { String key = keys.next(); connection.setRequestProperty(key, headers.getString(key)); }
                connection.setRequestProperty("Range", range);
                process.onCancel(connection::disconnect);
                try {
                    process.checkCancelled();
                    int status = connection.getResponseCode();
                    // An unknown length ends when the server has nothing past the last byte.
                    if (status == 416 && total == 0 && loaded > 0) break;
                    boolean whole = status == 200 && loaded == 0;
                    if (status != 206 && !whole) throw new IOException("Media server returned HTTP " + status + ".");
                    if (total == 0) total = whole ? connection.getContentLengthLong() : rangeTotal(connection.getHeaderField("Content-Range"));
                    if (total > MAX_SOURCE_BYTES) throw new MediaProcess.Failure("larger than max-filesize");
                    long start = loaded;
                    try (InputStream input = connection.getInputStream()) {
                        byte[] buffer = new byte[64 * 1024];
                        for (int count; (count = input.read(buffer)) != -1; ) {
                            process.checkCancelled();
                            output.write(buffer, 0, count);
                            loaded += count;
                            if (loaded > MAX_SOURCE_BYTES) throw new MediaProcess.Failure("larger than max-filesize");
                            if (loaded - reported >= 256 * 1024) {
                                reported = loaded;
                                progress.accept(new JSONObject().put("stage", "downloading").put("loaded", loaded).put("total", Math.max(loaded, total)));
                            }
                        }
                    }
                    if (whole) { total = loaded; break; }
                    if (loaded == start) throw new IOException("The media server sent no data.");
                } finally { process.onCancel(null); connection.disconnect(); }
            }
        }
        process.checkCancelled();
        if (loaded == 0 || (total > 0 && loaded != total)) throw new IOException("The audio download was incomplete.");
    }

    static String mime(String format) { return "mp3".equals(format) ? "audio/mpeg" : "m4a".equals(format) ? "audio/mp4" : "audio/ogg"; }
    File folder(String id) {
        if (id == null || !id.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Invalid download identifier.");
        return new File(root, id);
    }
    void release(String id) { delete(folder(id)); }
    private static void stage(Consumer<JSONObject> progress, String stage) {
        try { progress.accept(new JSONObject().put("stage", stage)); } catch (JSONException ignored) { }
    }
    static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }
}
