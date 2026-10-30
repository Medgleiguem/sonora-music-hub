package app.sonora.music;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.*;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class YoutubeStreamTest {
    private static final String ID = "dQw4w9WgXcQ";
    // Real visitor identities are several hundred characters long.
    private static final String VISITOR_ID = "CgtWaXNpdG9yMTIz" + new String(new char[450]).replace('\0', 'Q') + "%3D";
    private static final String VISITOR = ")]}'\n[[\"data\",null,[[[0,1,2,3,4,5,6,7,8,9,10,11,12,\"" + VISITOR_ID + "\"]]]]]";

    @Before public void isolateVisitor() { YoutubeStream.forgetVisitor(); }

    private static JSONObject audio(int itag, String mime, long bitrate) throws Exception {
        return new JSONObject().put("itag", itag).put("mimeType", mime).put("bitrate", bitrate)
            .put("url", "https://rr1---sn-test.googlevideo.com/videoplayback?itag=" + itag + "&expire=" + (System.currentTimeMillis() / 1000 + 21600));
    }
    private static JSONObject player(String status, JSONArray formats) throws Exception {
        return new JSONObject().put("playabilityStatus", new JSONObject().put("status", status))
            .put("videoDetails", new JSONObject().put("videoId", ID).put("title", "Song").put("lengthSeconds", "213"))
            .put("streamingData", new JSONObject().put("adaptiveFormats", formats));
    }

    @Test public void choosesOriginalHighestBitrateAudioThatPassesAddressValidation() throws Exception {
        JSONArray formats = new JSONArray()
            .put(new JSONObject().put("itag", 137).put("mimeType", "video/mp4").put("bitrate", 900000).put("url", "https://rr1---sn-test.googlevideo.com/videoplayback"))
            .put(audio(140, "audio/mp4; codecs=\"mp4a.40.2\"", 130000))
            .put(audio(251, "audio/webm; codecs=\"opus\"", 140000))
            .put(audio(252, "audio/webm; codecs=\"opus\"", 400000).put("isDrc", true))
            .put(audio(253, "audio/webm; codecs=\"opus\"", 300000).put("audioTrack", new JSONObject().put("audioIsDefault", false)))
            .put(new JSONObject().put("itag", 254).put("mimeType", "audio/webm").put("bitrate", 500000).put("signatureCipher", "s=x"));
        JSONObject result = NativeMedia.streamResult(YoutubeStream.result(player("OK", formats), ID));
        assertTrue(result.getString("url").contains("itag=251"));
        assertEquals("audio/webm", result.getString("mime"));
        assertEquals(213, result.getDouble("duration"), 0);
        assertEquals(YoutubeStream.USER_AGENT, result.getJSONObject("headers").getString("User-Agent"));
    }

    @Test public void downloadsPreferTheRequestedContainerSoNoReEncodingIsNeeded() throws Exception {
        JSONArray formats = new JSONArray()
            .put(audio(139, "audio/mp4; codecs=\"mp4a.40.5\"", 50000).put("contentLength", "1000"))
            .put(audio(140, "audio/mp4; codecs=\"mp4a.40.2\"", 130000).put("contentLength", "3500000"))
            .put(audio(251, "audio/webm; codecs=\"opus\"", 140000));
        JSONObject m4a = YoutubeStream.result(player("OK", formats), ID, "audio/mp4");
        assertTrue(m4a.getString("url").contains("itag=140"));
        assertEquals("mp4a", m4a.getString("acodec"));
        assertEquals(3_500_000L, m4a.getLong("filesize"));
        assertTrue(YoutubeStream.result(player("OK", formats), ID, "audio/webm").getString("url").contains("itag=251"));
        // Without a preference, or when the preferred container is missing, the best audio is still used.
        assertTrue(YoutubeStream.result(player("OK", formats), ID).getString("url").contains("itag=251"));
        JSONArray webmOnly = new JSONArray().put(audio(251, "audio/webm; codecs=\"opus\"", 140000));
        assertTrue(YoutubeStream.result(player("OK", webmOnly), ID, "audio/mp4").getString("url").contains("itag=251"));
    }

    @Test public void botCheckRetriesOnceWithFreshVisitorThenDefersToExtractor() throws Exception {
        AtomicInteger players = new AtomicInteger(), visitors = new AtomicInteger();
        List<String> sentVisitors = new ArrayList<>();
        YoutubeStream stream = new YoutubeStream((url, body, headers, process, deadline) -> {
            if (url.endsWith("/sw.js_data")) { visitors.incrementAndGet(); return VISITOR; }
            players.incrementAndGet(); sentVisitors.add(headers.get("X-Goog-Visitor-Id"));
            assertEquals(ID, body.getString("videoId"));
            return player("LOGIN_REQUIRED", new JSONArray()).toString();
        }, () -> 0);
        assertThrows(IOException.class, () -> stream.resolve(ID, new MediaProcess()));
        assertEquals(2, players.get());
        assertTrue(visitors.get() >= 1);
        assertEquals(Arrays.asList(VISITOR_ID, VISITOR_ID), sentVisitors);
    }

    @Test public void liveMismatchedOrCipheredResponsesDeferToExtractor() throws Exception {
        JSONObject live = player("OK", new JSONArray().put(audio(251, "audio/webm", 1)));
        live.getJSONObject("videoDetails").put("isLive", true);
        assertThrows(IOException.class, () -> YoutubeStream.result(live, ID));
        assertThrows(IOException.class, () -> YoutubeStream.result(player("OK", new JSONArray().put(audio(251, "audio/webm", 1))), "aaaaaaaaaaa"));
        assertThrows(IOException.class, () -> YoutubeStream.result(player("OK", new JSONArray()
            .put(new JSONObject().put("itag", 251).put("mimeType", "audio/webm").put("signatureCipher", "s=x"))), ID));
        assertThrows(IllegalArgumentException.class, () -> new YoutubeStream((url, body, headers, process, deadline) -> "", () -> 0).resolve("../x", new MediaProcess()));
    }
}
