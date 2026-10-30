package app.sonora.music;

import android.os.SystemClock;
import org.json.*;
import java.io.IOException;
import java.util.*;
import java.util.function.LongSupplier;
import java.util.regex.*;

/**
 * Direct audio addresses from a player client that needs no player JavaScript: two small HTTPS
 * requests instead of starting the extractor. Any unexpected response falls back to the extractor.
 */
final class YoutubeStream {
    interface Transport { String load(String url, JSONObject body, Map<String, String> headers, MediaProcess process, long deadline) throws Exception; }
    static final String USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
    private static final Pattern VISITOR = Pattern.compile("[A-Za-z0-9_%=-]{10,1000}");
    private static final Pattern PAGE_VISITOR = Pattern.compile("\"VISITOR_DATA\":\"([A-Za-z0-9_%=-]{10,1000})\"");
    private static final long VISITOR_TTL_MS = 60 * 60_000;
    // A visitor identity is anonymous and shared by every resolution in this process, like a browser cookie.
    private static String visitor;
    private static long visitorExpires;
    private final Transport transport;
    private final LongSupplier clock;

    YoutubeStream() { this(YoutubeSearch::request, SystemClock::elapsedRealtime); }

    /** Tests only: real downloads earlier in the same process share the visitor identity. */
    static synchronized void forgetVisitor() { visitor = null; visitorExpires = 0; }
    YoutubeStream(Transport transport, LongSupplier clock) { this.transport = transport; this.clock = clock; }

    /** Returns extractor-shaped metadata for {@link NativeMedia#streamResult}, which applies the address checks. */
    JSONObject resolve(String videoId, MediaProcess process) throws Exception { return resolve(videoId, null, process); }

    /** @param preferredMime "audio/mp4" or "audio/webm" to pick that container when offered, so a download needs no re-encoding. */
    JSONObject resolve(String videoId, String preferredMime, MediaProcess process) throws Exception {
        if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) throw new IllegalArgumentException("Paste a valid YouTube video URL.");
        long deadline = clock.getAsLong() + 8_000;
        for (int attempt = 0; attempt < 2; attempt++) {
            String id = visitor(attempt > 0, process, deadline);
            JSONObject response = new JSONObject(transport.load("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", body(videoId), headers(id), process, deadline));
            JSONObject playability = response.optJSONObject("playabilityStatus");
            String status = playability == null ? "" : playability.optString("status");
            if ("OK".equals(status)) return result(response, videoId, preferredMime);
            // A bot check can mean an expired visitor identity; retry once with a fresh one.
            if (!"LOGIN_REQUIRED".equals(status)) break;
        }
        throw new IOException("Unsupported player response.");
    }

    private String visitor(boolean refresh, MediaProcess process, long deadline) throws Exception {
        synchronized (YoutubeStream.class) {
            if (!refresh && visitor != null && clock.getAsLong() < visitorExpires) return visitor;
        }
        String fresh;
        try {
            String text = transport.load("https://www.youtube.com/sw.js_data", null, Collections.singletonMap("User-Agent", USER_AGENT), process, deadline);
            fresh = new JSONArray(text.substring(text.indexOf('['))).getJSONArray(0).getJSONArray(2).getJSONArray(0).getJSONArray(0).getString(13);
            if (!VISITOR.matcher(fresh).matches()) throw new IOException("Unsupported visitor response.");
        } catch (Exception unsupported) {
            process.checkCancelled();
            Matcher page = PAGE_VISITOR.matcher(transport.load("https://www.youtube.com/?hl=en", null, Collections.emptyMap(), process, deadline));
            if (!page.find()) throw new IOException("Unsupported visitor response.");
            fresh = page.group(1);
        }
        synchronized (YoutubeStream.class) {
            visitor = fresh;
            visitorExpires = clock.getAsLong() + VISITOR_TTL_MS;
        }
        return fresh;
    }

    private static JSONObject body(String videoId) throws JSONException {
        JSONObject client = new JSONObject().put("clientName", "VISIONOS").put("clientVersion", "1.02").put("deviceMake", "Apple")
            .put("deviceModel", "RealityDevice17,1").put("userAgent", USER_AGENT).put("osName", "visionOS").put("osVersion", "26.5.23O471")
            .put("hl", "en").put("timeZone", "UTC").put("utcOffsetMinutes", 0);
        return new JSONObject().put("context", new JSONObject().put("client", client)).put("videoId", videoId)
            .put("playbackContext", new JSONObject().put("contentPlaybackContext", new JSONObject().put("html5Preference", "HTML5_PREF_WANTS")))
            .put("contentCheckOk", true).put("racyCheckOk", true);
    }

    private static Map<String, String> headers(String visitor) {
        Map<String, String> headers = new HashMap<>();
        headers.put("User-Agent", USER_AGENT); headers.put("Origin", "https://www.youtube.com");
        headers.put("X-YouTube-Client-Name", "101"); headers.put("X-YouTube-Client-Version", "1.02");
        headers.put("X-Goog-Visitor-Id", visitor);
        return headers;
    }

    static JSONObject result(JSONObject response, String videoId) throws Exception { return result(response, videoId, null); }

    static JSONObject result(JSONObject response, String videoId, String preferredMime) throws Exception {
        JSONObject details = response.optJSONObject("videoDetails");
        if (details == null || !videoId.equals(details.optString("videoId")) || details.optBoolean("isLive") || details.optBoolean("isPostLiveDvr"))
            throw new IOException("Unsupported player response.");
        JSONObject streaming = response.optJSONObject("streamingData");
        JSONArray formats = streaming == null ? null : streaming.optJSONArray("adaptiveFormats");
        JSONObject best = null;
        if (formats != null) for (int i = 0; i < formats.length(); i++) {
            JSONObject format = formats.optJSONObject(i);
            if (format == null || !format.has("url") || format.optBoolean("isDrc")) continue;
            String mime = format.optString("mimeType");
            if (!mime.startsWith("audio/webm") && !mime.startsWith("audio/mp4")) continue;
            // Dubbed uploads list several tracks; keep the original language like the extractor does.
            JSONObject track = format.optJSONObject("audioTrack");
            if (track != null && !track.optBoolean("audioIsDefault")) continue;
            boolean preferred = preferredMime != null && mime.startsWith(preferredMime);
            boolean bestPreferred = best != null && preferredMime != null && best.optString("mimeType").startsWith(preferredMime);
            if (best == null || preferred && !bestPreferred || preferred == bestPreferred && format.optLong("bitrate") > best.optLong("bitrate")) best = format;
        }
        if (best == null) throw new IOException("Unsupported player response.");
        boolean webm = best.optString("mimeType").startsWith("audio/webm");
        double duration = details.optDouble("lengthSeconds", 0);
        if (!(duration > 0)) duration = best.optDouble("approxDurationMs", 0) / 1000;
        return new JSONObject().put("url", best.getString("url")).put("ext", webm ? "webm" : "m4a").put("acodec", webm ? "opus" : "mp4a")
            .put("title", details.optString("title", "YouTube audio")).put("duration", duration).put("filesize", best.optLong("contentLength", 0))
            .put("http_headers", new JSONObject().put("User-Agent", USER_AGENT));
    }
}
