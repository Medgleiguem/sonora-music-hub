package app.sonora.music;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class EngineReliabilityTest {
    @Test public void resolverRestrictsMediaUrlsAndScopesHeaders() throws Exception {
        JSONObject raw = new JSONObject().put("url", "https://rr1---sn-example.googlevideo.com/videoplayback?sig=secret")
            .put("ext", "m4a").put("acodec", "mp4a.40.2").put("title", "المقاوم").put("duration", 214)
            .put("http_headers", new JSONObject().put("User-Agent", "Mozilla/5.0").put("Referer", "https://www.youtube.com/")
                .put("Cookie", "private").put("Authorization", "private").put("Host", "evil.example"));
        JSONObject stream = NativeMedia.streamResult(raw);
        assertEquals("audio/mp4", stream.getString("mime"));
        assertEquals(214, stream.getDouble("duration"), 0);
        assertEquals("Mozilla/5.0", stream.getJSONObject("headers").getString("User-Agent"));
        assertFalse(stream.getJSONObject("headers").has("Cookie"));
        assertFalse(stream.getJSONObject("headers").has("Authorization"));
        assertFalse(stream.getJSONObject("headers").has("Host"));
        for (String url : Arrays.asList("http://rr1.googlevideo.com/videoplayback", "https://googlevideo.com.evil.example/videoplayback",
            "https://googlevideo.com@evil.example/videoplayback", "https://127.0.0.1/videoplayback", "file:///tmp/audio", "https://rr1.googlevideo.com:999/videoplayback")) {
            raw.put("url", url);
            IOException error = assertThrows(IOException.class, () -> NativeMedia.streamResult(raw));
            assertFalse("Signed URLs must not leak into errors", error.getMessage().contains(url));
        }
        raw.put("url", "https://rr1.googlevideo.com/videoplayback");
        raw.getJSONObject("http_headers").put("User-Agent", "a\r\nCookie: stolen");
        assertThrows(IOException.class, () -> NativeMedia.streamResult(raw));
    }

    @Test public void resolverRejectsLiveAndMissingAudio() throws Exception {
        JSONObject raw = new JSONObject().put("url", "https://rr1.googlevideo.com/videoplayback").put("ext", "webm").put("acodec", "none");
        assertThrows(IOException.class, () -> NativeMedia.streamResult(raw));
        raw.put("acodec", "opus").put("is_live", true);
        assertThrows(IOException.class, () -> NativeMedia.streamResult(raw));
    }

    @Test(timeout = 10000) public void lookupCoalescesAndCancellationDoesNotCancelOtherSubscriber() throws Exception {
        AtomicInteger loads = new AtomicInteger();
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        NativeMedia.LookupCache cache = new NativeMedia.LookupCache((query, playlist, process) -> {
            loads.incrementAndGet(); entered.countDown();
            while (!release.await(20, TimeUnit.MILLISECONDS)) process.checkCancelled();
            return new JSONObject().put("results", "metadata");
        }, System::currentTimeMillis);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        MediaProcess first = new MediaProcess();
        try {
            Future<JSONObject> a = workers.submit(() -> cache.get("same", false, first));
            assertTrue(entered.await(2, TimeUnit.SECONDS));
            Future<JSONObject> b = workers.submit(() -> cache.get("same", false, new MediaProcess()));
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (cache.subscribers("same", false) < 2 && System.nanoTime() < until) Thread.sleep(10);
            assertEquals(2, cache.subscribers("same", false));
            first.cancel("Search cancelled.");
            assertThrows(ExecutionException.class, () -> a.get(2, TimeUnit.SECONDS));
            release.countDown();
            assertEquals("metadata", b.get(2, TimeUnit.SECONDS).getString("results"));
            assertEquals(1, loads.get());
            cache.get("same", false, new MediaProcess()).put("results", "mutated");
            assertEquals("metadata", cache.get("same", false, new MediaProcess()).getString("results"));
        } finally { release.countDown(); workers.shutdownNow(); }
    }

    @Test(timeout = 10000) public void lookupCacheExpiresEvictsAndNeverCachesFailure() throws Exception {
        AtomicInteger loads = new AtomicInteger(); AtomicLong time = new AtomicLong();
        NativeMedia.LookupCache cache = new NativeMedia.LookupCache((query, playlist, process) -> {
            loads.incrementAndGet();
            if (query.equals("fail")) throw new IOException("network");
            return new JSONObject().put("query", query);
        }, time::get);
        cache.get("one", false, new MediaProcess()); cache.get("one", false, new MediaProcess());
        assertEquals(1, loads.get());
        time.set(120001); cache.get("one", false, new MediaProcess()); assertEquals(2, loads.get());
        for (int i = 0; i < 25; i++) cache.get("query" + i, false, new MediaProcess());
        cache.get("one", false, new MediaProcess()); assertEquals(28, loads.get());
        for (int i = 0; i < 2; i++) assertThrows(IOException.class, () -> cache.get("fail", false, new MediaProcess()));
        assertEquals(30, loads.get());
        MediaProcess cancelled = new MediaProcess(); cancelled.cancel("Search cancelled.");
        assertThrows(IOException.class, () -> cache.get("cancelled", false, cancelled));
        assertEquals(30, loads.get());
    }

    @Test(timeout = 10000) public void cancellingLastLookupStopsWorkAndAllowsFreshRetry() throws Exception {
        AtomicInteger loads = new AtomicInteger();
        CountDownLatch entered = new CountDownLatch(1), stopped = new CountDownLatch(1);
        NativeMedia.LookupCache cache = new NativeMedia.LookupCache((query, playlist, process) -> {
            if (loads.incrementAndGet() == 1) {
                entered.countDown();
                try { while (true) { process.checkCancelled(); Thread.sleep(10); } }
                finally { stopped.countDown(); }
            }
            return new JSONObject().put("fresh", true);
        }, System::currentTimeMillis);
        ExecutorService worker = Executors.newSingleThreadExecutor();
        MediaProcess caller = new MediaProcess();
        try {
            Future<JSONObject> result = worker.submit(() -> cache.get("same", false, caller));
            assertTrue(entered.await(2, TimeUnit.SECONDS));
            caller.cancel("Search cancelled.");
            assertThrows(ExecutionException.class, () -> result.get(2, TimeUnit.SECONDS));
            assertTrue(stopped.await(2, TimeUnit.SECONDS));
            assertTrue(cache.get("same", false, new MediaProcess()).getBoolean("fresh"));
            assertEquals(2, loads.get());
        } finally { worker.shutdownNow(); }
    }

    @Test(timeout = 30000) public void processClassifiesZeroStatusSkipsWithoutExposingSignedUrls() throws Exception {
        NativeMedia media = new NativeMedia(InstrumentationRegistry.getInstrumentation().getTargetContext());
        media.init();
        ProcessBuilder builder = media.command(java.util.Collections.emptyList());
        String python = builder.command().get(0);
        builder.command(python, "-c", "print('Video does not pass filter (duration <= 1800), skipping')");
        MediaProcess.Failure skipped = assertThrows(MediaProcess.Failure.class,
            () -> new MediaProcess().run(builder, 5000, null, line -> {}));
        assertEquals("VIDEO_LIMIT", skipped.code);
        assertTrue(skipped.getMessage().contains("30 minutes"));
        builder.command(python, "-c", "import sys; print('HTTP Error 403: https://rr1.googlevideo.com/videoplayback?sig=secret',file=sys.stderr); sys.exit(1)");
        MediaProcess.Failure denied = assertThrows(MediaProcess.Failure.class,
            () -> new MediaProcess().run(builder, 5000, null, line -> {}));
        assertEquals("YOUTUBE_REFUSED", denied.code);
        assertFalse(denied.getMessage().contains("secret"));
    }

    @Test public void outputValidationRejectsNonAudioAndFailureMessagesAreSpecific() throws Exception {
        File file = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(), "invalid-audio-test.mp3");
        try {
            Files.write(file.toPath(), "<html>upstream error</html>".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            assertThrows(IOException.class, () -> NativeMedia.validateAudio(file));
        } finally { file.delete(); }
        assertTrue(MediaProcess.publicError("Video does not pass filter (!is_live & duration <= 1800), skipping").contains("30 minutes"));
        assertTrue(MediaProcess.publicError("File is larger than max-filesize (100MiB > 96MiB), skipping").contains("large"));
        assertTrue(MediaProcess.publicError("ERROR: Sign in to confirm you're not a bot").contains("refused"));
        assertTrue(MediaProcess.publicError("Permission denied").contains("permission"));
    }
}
