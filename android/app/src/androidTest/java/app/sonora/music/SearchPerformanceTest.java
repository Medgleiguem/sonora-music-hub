package app.sonora.music;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SearchPerformanceTest {
    private static JSONObject video(int index) throws Exception {
        return new JSONObject().put("videoRenderer", new JSONObject().put("videoId", String.format(java.util.Locale.ROOT, "%011d", index))
            .put("title", new JSONObject().put("runs", new JSONArray().put(new JSONObject().put("text", "أغنية " + index))))
            .put("ownerText", new JSONObject().put("simpleText", "Artist"))
            .put("lengthText", new JSONObject().put("simpleText", "3:21")));
    }
    private static JSONObject page(JSONArray entries) throws Exception {
        return new JSONObject().put("contents", new JSONObject().put("twoColumnSearchResultsRenderer", new JSONObject()
            .put("primaryContents", new JSONObject().put("sectionListRenderer", new JSONObject().put("contents", entries)
                .put("subMenu", new JSONObject().put("searchSubMenuRenderer", new JSONObject().put("title", "Filters")))))));
    }

    @Test public void preservesTwentyFourResultsUsingBoundedContinuation() throws Exception {
        JSONArray first = new JSONArray(), next = new JSONArray();
        for (int i = 0; i < 20; i++) first.put(video(i));
        first.put(new JSONObject().put("continuationItemRenderer", new JSONObject().put("continuationEndpoint", new JSONObject().put("continuationCommand", new JSONObject().put("token", "next-page")))));
        for (int i = 20; i < 40; i++) next.put(video(i));
        JSONObject initial = page(first), config = new JSONObject().put("INNERTUBE_CONTEXT", new JSONObject().put("client", new JSONObject().put("clientName", "WEB")));
        AtomicInteger requests = new AtomicInteger();
        YoutubeSearch search = new YoutubeSearch((url, body, process, deadline) -> {
            if (requests.getAndIncrement() == 0) return "<script>ytcfg.set('EVENT_ID','public-event');ytcfg.set(" + config + ");</script><script>var ytInitialData = " + initial + ";</script>";
            assertEquals("next-page", body.getString("continuation"));
            return new JSONObject().put("onResponseReceivedCommands", new JSONArray().put(new JSONObject().put("appendContinuationItemsAction", new JSONObject().put("continuationItems", next)))).toString();
        });
        JSONObject result = search.search("فيروز & music", "video", new MediaProcess());
        assertEquals(24, result.getJSONArray("entries").length());
        assertEquals(2, requests.get());
        assertEquals("أغنية 0", result.getJSONArray("entries").getJSONObject(0).getString("title"));
        assertEquals(201, result.getJSONArray("entries").getJSONObject(0).getInt("duration"));
    }

    @Test public void parserHandlesBracesAndEscapedQuotesWithoutExecutingScripts() throws Exception {
        JSONObject data = page(new JSONArray().put(video(1)));
        data.put("description", "A }; and a \"quoted\" value");
        assertEquals(data.toString(), YoutubeSearch.initialData("<script>var ytInitialData = " + data + ";</script>").toString());
        assertThrows(IOException.class, () -> YoutubeSearch.initialData("<script>window.evil()</script>"));
    }

    @Test public void unfamiliarOrMixedResultLayoutsUseExtractorFallback() throws Exception {
        for (JSONArray entries : new JSONArray[] {
            new JSONArray().put(new JSONObject().put("futureVideoRenderer", new JSONObject().put("id", "unrecognized"))),
            new JSONArray().put(video(1)).put(new JSONObject().put("lockupViewModel", new JSONObject().put("contentType", "LOCKUP_CONTENT_TYPE_VIDEO").put("contentId", "00000000002")))
        }) {
            YoutubeSearch search = new YoutubeSearch((url, body, process, deadline) -> "var ytInitialData = " + page(entries) + ";");
            assertThrows(IOException.class, () -> search.search("Artist", "video", new MediaProcess()));
        }
    }

    @Test public void absoluteDeadlineIncludesSlowlyProgressingResponses() throws Exception {
        java.util.concurrent.atomic.AtomicLong clock = new java.util.concurrent.atomic.AtomicLong();
        YoutubeSearch search = new YoutubeSearch((url, body, process, deadline) -> {
            assertEquals(10000, deadline);
            clock.set(10001);
            return "var ytInitialData = " + page(new JSONArray().put(video(1))) + ";";
        }, clock::get);
        assertThrows(IOException.class, () -> search.search("Artist", "video", new MediaProcess()));
    }

    @Test(timeout = 5000) public void metadataRequestsCannotStarvePlaybackResolution() throws Exception {
        java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(2), release = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.ExecutorService callers = java.util.concurrent.Executors.newFixedThreadPool(3);
        NativeMedia.LookupCache metadata = new NativeMedia.LookupCache((query, playlist, process) -> {
            entered.countDown(); release.await(); return new JSONObject();
        }, android.os.SystemClock::elapsedRealtime);
        try {
            callers.submit(() -> metadata.get("one", false, new MediaProcess()));
            callers.submit(() -> metadata.get("two", false, new MediaProcess()));
            assertTrue(entered.await(2, java.util.concurrent.TimeUnit.SECONDS));
            NativeMedia.LookupCache playback = NativeMedia.streamCache((query, playlist, process) -> new JSONObject().put("url", "https://rr1.googlevideo.com/videoplayback"), android.os.SystemClock::elapsedRealtime);
            assertNotNull(callers.submit(() -> playback.get("song", false, new MediaProcess())).get(500, java.util.concurrent.TimeUnit.MILLISECONDS));
        } finally { release.countDown(); callers.shutdownNow(); }
    }

    @Test public void cancellationStopsNativeHttpWithoutStartingFallbackWork() throws Exception {
        MediaProcess process = new MediaProcess();
        AtomicInteger cancelled = new AtomicInteger();
        process.onCancel(cancelled::incrementAndGet);
        process.cancel("Search cancelled.");
        assertEquals(1, cancelled.get());
        assertThrows(IOException.class, process::checkCancelled);
    }

    @Test public void expiryAwareCacheNeverReusesExpiredOrFailedStreamAddresses() throws Exception {
        java.util.concurrent.atomic.AtomicLong now = new java.util.concurrent.atomic.AtomicLong();
        AtomicInteger loads = new AtomicInteger();
        NativeMedia.LookupCache cache = new NativeMedia.LookupCache((query, playlist, process) -> {
            if (query.equals("failure")) throw new IOException("Refused");
            loads.incrementAndGet(); return new JSONObject().put("value", "private-stream-metadata");
        }, now::get, 2, value -> 1000);
        cache.get("song", false, new MediaProcess()); cache.get("song", false, new MediaProcess());
        assertEquals(1, loads.get());
        now.set(1001); cache.get("song", false, new MediaProcess()); assertEquals(2, loads.get());
        cache.invalidate("song", false); cache.get("song", false, new MediaProcess()); assertEquals(3, loads.get());
        assertThrows(IOException.class, () -> cache.get("failure", false, new MediaProcess()));
        assertFalse(cache.contains("failure", false));
        cache.get("two", false, new MediaProcess()); cache.get("three", false, new MediaProcess());
        assertFalse(cache.contains("song", false));
    }
}
