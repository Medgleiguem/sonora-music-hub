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
import java.util.concurrent.*;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

final class NativeMedia {
    static final long MAX_AUDIO_BYTES = 64L * 1024 * 1024;
    private final Context context;
    private final File root;
    private static final Object ENGINE_LOCK = new Object();
    private boolean initialized;
    private final LookupCache lookups = new LookupCache(this::lookupUncached, SystemClock::elapsedRealtime);

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

    ProcessBuilder command(List<String> args) {
        File binaries = new File(context.getApplicationInfo().nativeLibraryDir);
        File base = new File(context.getNoBackupFilesDir(), "youtubedl-android");
        File packages = new File(base, "packages");
        String python = new File(binaries, "libpython.so").getAbsolutePath();
        // A session gives this job its own process group without invoking a shell.
        String bootstrap = "import os,sys; os.setsid(); print('SONORA_PID='+str(os.getpid()),file=sys.stderr,flush=True); os.execv(sys.executable,[sys.executable,*sys.argv[1:]])";
        List<String> command = new ArrayList<>(Arrays.asList(python, "-c", bootstrap, engine().getAbsolutePath(),
            "--ignore-config", "--no-cache-dir", "--no-warnings", "--socket-timeout", "15", "--retries", "1", "--fragment-retries", "1", "--extractor-retries", "1", "--file-access-retries", "0",
            "--js-runtimes", "quickjs:" + new File(binaries, "libqjs.so"), "--ffmpeg-location", new File(binaries, "libffmpeg.so").getAbsolutePath()));
        command.addAll(args);
        ProcessBuilder builder = new ProcessBuilder(command);
        Map<String, String> env = builder.environment();
        env.put("LD_LIBRARY_PATH", new File(packages, "python/usr/lib") + ":" + new File(packages, "ffmpeg/usr/lib"));
        env.put("SSL_CERT_FILE", new File(packages, "python/usr/etc/tls/cert.pem").getAbsolutePath());
        env.put("PYTHONHOME", new File(packages, "python/usr").getAbsolutePath());
        env.put("TMPDIR", context.getCacheDir().getAbsolutePath());
        env.put("PATH", env.getOrDefault("PATH", "/system/bin") + ":" + binaries);
        return builder;
    }

    JSONObject lookup(String input, boolean playlist, MediaProcess process) throws Exception {
        String query;
        if (playlist) query = source(input, true);
        else {
            if (input == null || input.length() > 200 || input.indexOf('\0') >= 0) throw new IllegalArgumentException("Enter a search of up to 200 characters.");
            query = "ytsearch24:" + (input.trim().isEmpty() ? "popular music" : input.trim());
        }
        return lookups.get(query, playlist, process);
    }

    private JSONObject lookupUncached(String query, boolean playlist, MediaProcess process) throws Exception {
        process.checkCancelled();
        init();
        String output = process.run(command(Arrays.asList("--flat-playlist", "--playlist-end", playlist ? "100" : "24", "--dump-single-json", "--skip-download", "--", query)), 50_000, null, line -> {});
        JSONObject data = new JSONObject(output);
        JSONArray items = data.optJSONArray("entries");
        JSONArray entries = new JSONArray();
        if (items != null) for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null || !item.optString("id").matches("[A-Za-z0-9_-]{11}")) continue;
            String id = item.getString("id");
            entries.put(new JSONObject().put("id", "youtube-" + id).put("externalId", id).put("title", item.optString("title", "Untitled video"))
                .put("artist", item.optString("channel", item.optString("uploader", "YouTube"))).put("album", data.optString("title", "YouTube"))
                .put("duration", item.optDouble("duration", 0)).put("cover", "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg")
                .put("shareUrl", "https://www.youtube.com/watch?v=" + id).put("source", "youtube"));
        }
        return playlist ? new JSONObject().put("title", data.optString("title", "YouTube playlist")).put("entries", entries)
            .put("limited", data.optInt("playlist_count", data.optInt("n_entries", entries.length())) > entries.length())
            : new JSONObject().put("results", entries);
    }

    /** Signed media URLs are short lived: resolve on demand, never cache or log them. */
    JSONObject resolve(String youtubeUrl, MediaProcess process) throws Exception {
        String url = source(youtubeUrl, false);
        process.checkCancelled();
        long started = SystemClock.elapsedRealtime();
        init();
        long remaining = 45_000 - (SystemClock.elapsedRealtime() - started);
        if (remaining <= 0) throw new IOException("The media request timed out. Retry now that Sonora is prepared.");
        String output = process.run(command(Arrays.asList("--no-playlist", "--skip-download", "--dump-single-json",
            "--format", "bestaudio[protocol=https]/best[protocol=https][acodec!=none]", "--", url)), remaining, null, line -> {});
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

    /** Metadata only, bounded to 24 queries for two minutes. Each caller owns its cancellation. */
    static final class LookupCache {
        private static final ExecutorService WORKERS = Executors.newFixedThreadPool(2);
        private final LookupLoader loader;
        private final LongSupplier clock;
        private final LinkedHashMap<String, CacheEntry> cache = new LinkedHashMap<>(32, .75f, true);
        private final Map<String, Flight> flights = new HashMap<>();
        LookupCache(LookupLoader loader, LongSupplier clock) { this.loader = loader; this.clock = clock; }
        private static String key(String query, boolean playlist) { return (playlist ? "playlist:" : "search:") + query; }
        synchronized int subscribers(String query, boolean playlist) {
            Flight flight = flights.get(key(query, playlist)); return flight == null ? 0 : flight.subscribers;
        }
        JSONObject get(String query, boolean playlist, MediaProcess caller) throws Exception {
            caller.checkCancelled();
            String key = key(query, playlist);
            Flight flight;
            synchronized (this) {
                cache.entrySet().removeIf(entry -> clock.getAsLong() - entry.getValue().created >= 120_000);
                CacheEntry hit = cache.get(key);
                if (hit != null) return new JSONObject(hit.json);
                flight = flights.get(key);
                if (flight == null) {
                    if (flights.size() >= 2) throw new IOException("Search is busy. Wait a moment and retry.");
                    flight = new Flight();
                    flights.put(key, flight);
                    Flight job = flight;
                    WORKERS.execute(() -> {
                        try {
                            String result = loader.load(query, playlist, job.process).toString();
                            job.process.checkCancelled();
                            synchronized (LookupCache.this) {
                                if (flights.get(key) == job && job.callers.stream().anyMatch(subscriber -> !subscriber.isCancelled())) {
                                    cache.put(key, new CacheEntry(result, clock.getAsLong()));
                                    while (cache.size() > 24) cache.remove(cache.keySet().iterator().next());
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
            final String json; final long created;
            CacheEntry(String json, long created) { this.json = json; this.created = created; }
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
                .put("mime", mime(format)).put("format", format);
        } finally {
            if (!complete) delete(directory);
        }
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
