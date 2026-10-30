package app.sonora.music;

import android.net.Uri;
import android.os.SystemClock;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.LongSupplier;

/** Public discovery metadata only. Unsupported layouts fall back to the bundled extractor. */
final class YoutubeSearch {
    interface Transport { String load(String url, JSONObject body, MediaProcess process, long deadline) throws Exception; }
    private static final ScheduledExecutorService DEADLINES = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "Sonora search deadline"); thread.setDaemon(true); return thread;
    });
    private static final String USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    private final Transport transport;
    private final LongSupplier clock;
    YoutubeSearch() { this(YoutubeSearch::request); }
    YoutubeSearch(Transport transport) { this(transport, SystemClock::elapsedRealtime); }
    YoutubeSearch(Transport transport, LongSupplier clock) { this.transport = transport; this.clock = clock; }

    private String load(String url, JSONObject body, MediaProcess process, long deadline) throws Exception {
        if (clock.getAsLong() >= deadline) throw new IOException("Search timed out.");
        process.checkCancelled();
        String result = transport.load(url, body, process, deadline);
        if (clock.getAsLong() >= deadline) throw new IOException("Search timed out.");
        process.checkCancelled();
        return result;
    }

    JSONObject search(String term, String type, MediaProcess process) throws Exception {
        String filter = "artist".equals(type) ? "EgIQAg==" : "playlist".equals(type) ? "EgIQAw==" : "EgIQAfABAQ==";
        String url = new Uri.Builder().scheme("https").authority("www.youtube.com").path("results")
            .appendQueryParameter("search_query", term).appendQueryParameter("sp", filter).appendQueryParameter("hl", "en").build().toString();
        long deadline = clock.getAsLong() + 10_000;
        process.checkCancelled();
        String html = load(url, null, process, deadline);
        JSONObject data = initialData(html);
        JSONObject root = data.optJSONObject("contents");
        if (root == null) throw new IOException("Unsupported search response.");
        JSONObject columns = root.optJSONObject("twoColumnSearchResultsRenderer");
        Object contents = columns == null ? root.optJSONObject("sectionListRenderer") : columns.opt("primaryContents");
        if (contents == null) throw new IOException("Unsupported search response.");
        Collector collector = new Collector(type);
        collector.visit(contents, 0);
        JSONObject config = null;
        int configAt = html.indexOf("ytcfg.set(");
        while (configAt >= 0) {
            int valueAt = configAt + "ytcfg.set(".length();
            while (valueAt < html.length() && Character.isWhitespace(html.charAt(valueAt))) valueAt++;
            // YouTube also calls set(name, value); only object-form calls contain client context.
            if (valueAt < html.length() && html.charAt(valueAt) == '{') {
                JSONObject candidate = objectAfter(html, valueAt);
                if (candidate.has("INNERTUBE_CONTEXT")) { config = candidate; break; }
            }
            configAt = html.indexOf("ytcfg.set(", configAt + 1);
        }
        for (int page = 0; collector.items.size() < 24 && collector.next != null; page++) {
            process.checkCancelled();
            if (page >= 2 || clock.getAsLong() >= deadline || config == null)
                throw new IOException("Search continuation is unavailable.");
            String next = collector.next;
            collector.next = null;
            JSONObject body = new JSONObject().put("context", config.getJSONObject("INNERTUBE_CONTEXT")).put("continuation", next);
            JSONObject response = new JSONObject(load("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", body, process, deadline));
            Object commands = response.opt("onResponseReceivedCommands");
            if (commands == null) commands = response.opt("onResponseReceivedActions");
            if (commands == null) throw new IOException("Unsupported search continuation.");
            collector.visit(commands, 0);
        }
        process.checkCancelled();
        if (clock.getAsLong() >= deadline) throw new IOException("Search timed out.");
        if (collector.unsupported || collector.items.isEmpty() && !collector.explicitEmpty) throw new IOException("Unsupported search result layout.");
        return new JSONObject().put("entries", new JSONArray(collector.items.values())).put("title", term);
    }

    static JSONObject initialData(String html) throws Exception {
        int at = html.indexOf("var ytInitialData =");
        if (at >= 0) return objectAfter(html, at + "var ytInitialData =".length());
        at = html.indexOf("window[\"ytInitialData\"] =");
        if (at >= 0) return objectAfter(html, at + "window[\"ytInitialData\"] =".length());
        throw new IOException("Unsupported search page.");
    }

    private static JSONObject objectAfter(String text, int offset) throws Exception {
        int start = offset;
        while (start < text.length() && Character.isWhitespace(text.charAt(start))) start++;
        if (start >= text.length() || text.charAt(start) != '{') throw new IOException("Invalid search data.");
        int depth = 0;
        boolean quoted = false, escaped = false;
        for (int at = start; at < text.length(); at++) {
            char value = text.charAt(at);
            if (quoted) {
                if (escaped) escaped = false;
                else if (value == '\\') escaped = true;
                else if (value == '"') quoted = false;
            } else if (value == '"') quoted = true;
            else if (value == '{') { if (++depth > 128) throw new IOException("Search data is too deep."); }
            else if (value == '}' && --depth == 0) return new JSONObject(text.substring(start, at + 1));
        }
        throw new IOException("Incomplete search data.");
    }

    static String text(JSONObject value) {
        if (value == null) return "";
        if (value.has("simpleText")) return value.optString("simpleText");
        if (value.has("content")) return value.optString("content");
        StringBuilder result = new StringBuilder();
        JSONArray runs = value.optJSONArray("runs");
        if (runs != null) for (int i = 0; i < runs.length(); i++) {
            JSONObject run = runs.optJSONObject(i); if (run != null) result.append(run.optString("text"));
        }
        return result.toString();
    }

    private static final class Collector {
        final String type;
        final LinkedHashMap<String, JSONObject> items = new LinkedHashMap<>();
        String next;
        int visited;
        boolean unsupported;
        boolean explicitEmpty;
        Collector(String type) { this.type = type; }
        void visit(Object value, int depth) throws Exception {
            if (depth > 64 || ++visited > 30_000) throw new IOException("Search data is too complex.");
            if (value instanceof JSONArray) {
                JSONArray array = (JSONArray) value;
                for (int i = 0; i < array.length(); i++) visit(array.opt(i), depth + 1);
            } else if (value instanceof JSONObject) {
                JSONObject object = (JSONObject) value;
                if (object.has("adSlotRenderer") || object.has("promotedSparklesWebRenderer") || object.has("reelShelfRenderer") || object.has("searchSubMenuRenderer")) return;
                if (object.has("messageRenderer") || object.has("searchResultsEmptyStateRenderer")) { explicitEmpty = true; return; }
                for (String name : Arrays.asList("videoRenderer", "playlistRenderer", "channelRenderer", "lockupViewModel")) {
                    JSONObject item = object.optJSONObject(name);
                    if (item != null) { add(name, item); return; }
                }
                JSONObject continuation = object.optJSONObject("continuationItemRenderer");
                if (continuation != null) {
                    JSONObject endpoint = continuation.optJSONObject("continuationEndpoint");
                    JSONObject command = endpoint == null ? null : endpoint.optJSONObject("continuationCommand");
                    if (command != null) next = command.optString("token", null);
                    return;
                }
                for (Iterator<String> keys = object.keys(); keys.hasNext();) {
                    String key = keys.next();
                    if ((key.endsWith("Renderer") || key.endsWith("ViewModel")) && !Arrays.asList("sectionListRenderer", "itemSectionRenderer", "richGridRenderer", "richItemRenderer", "horizontalListRenderer", "shelfRenderer", "expandedShelfContentsRenderer", "verticalListRenderer").contains(key)) unsupported = true;
                    visit(object.opt(key), depth + 1);
                }
            }
        }
        void add(String renderer, JSONObject item) throws Exception {
            if (items.size() >= 24) return;
            String id = "", title = "", channel = "", thumbnail = "";
            double duration = 0;
            if (renderer.equals("videoRenderer") && type.equals("video")) {
                id = item.optString("videoId"); title = text(item.optJSONObject("title")); channel = text(item.optJSONObject("ownerText"));
                String length = text(item.optJSONObject("lengthText"));
                if (length.matches("[0-9]+(:[0-9]{2}){1,2}")) for (String part : length.split(":")) duration = duration * 60 + Integer.parseInt(part);
            } else if (renderer.equals("channelRenderer") && type.equals("artist")) {
                id = item.optString("channelId"); title = text(item.optJSONObject("title")); channel = title;
            } else if (renderer.equals("playlistRenderer") && type.equals("playlist")) {
                id = item.optString("playlistId"); title = text(item.optJSONObject("title")); channel = text(item.optJSONObject("shortBylineText"));
            } else if (renderer.equals("lockupViewModel")) {
                String contentType = item.optString("contentType");
                if (!type.equals("playlist") || !contentType.contains("PLAYLIST")) {
                    if (type.equals("video") && contentType.equals("LOCKUP_CONTENT_TYPE_VIDEO") || !Arrays.asList("LOCKUP_CONTENT_TYPE_VIDEO", "LOCKUP_CONTENT_TYPE_PLAYLIST", "LOCKUP_CONTENT_TYPE_PODCAST").contains(contentType)) unsupported = true;
                    return;
                }
                id = item.optString("contentId");
                JSONObject image = child(item, "contentImage", "collectionThumbnailViewModel", "primaryThumbnail", "thumbnailViewModel", "image");
                JSONArray sources = image == null ? null : image.optJSONArray("sources");
                if (sources != null && sources.length() > 0) thumbnail = sources.getJSONObject(sources.length() - 1).optString("url");
                JSONObject metadata = item.optJSONObject("metadata");
                JSONObject lockup = metadata == null ? null : metadata.optJSONObject("lockupMetadataViewModel");
                if (lockup != null) {
                    title = text(lockup.optJSONObject("title"));
                    JSONObject content = lockup.optJSONObject("metadata");
                    JSONObject rows = content == null ? null : content.optJSONObject("contentMetadataViewModel");
                    JSONArray rowItems = rows == null ? null : rows.optJSONArray("metadataRows");
                    JSONObject row = rowItems == null ? null : rowItems.optJSONObject(0);
                    JSONArray parts = row == null ? null : row.optJSONArray("metadataParts");
                    JSONObject part = parts == null ? null : parts.optJSONObject(0);
                    if (part != null) channel = text(part.optJSONObject("text"));
                }
            } else return;
            if (!id.matches(type.equals("artist") ? "UC[A-Za-z0-9_-]{22}" : type.equals("video") ? "[A-Za-z0-9_-]{11}" : "[A-Za-z0-9_-]{12,100}") || items.containsKey(id)) return;
            JSONObject images = item.optJSONObject("thumbnail");
            JSONArray thumbs = images == null ? null : images.optJSONArray("thumbnails");
            if (thumbs != null && thumbs.length() > 0) thumbnail = thumbs.getJSONObject(thumbs.length() - 1).optString("url");
            items.put(id, new JSONObject().put("id", id).put("title", title).put("channel", channel).put("duration", duration).put("thumbnail", thumbnail));
        }
    }

    private static JSONObject child(JSONObject value, String... keys) {
        for (String key : keys) { if (value == null) return null; value = value.optJSONObject(key); }
        return value;
    }

    private static String request(String address, JSONObject body, MediaProcess process, long deadline) throws Exception {
        return request(address, body, Collections.emptyMap(), process, deadline);
    }

    static String request(String address, JSONObject body, Map<String, String> headers, MediaProcess process, long deadline) throws Exception {
        URL url = new URL(address);
        if (!"https".equals(url.getProtocol()) || !"www.youtube.com".equals(url.getHost())) throw new IOException("Invalid search endpoint.");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        long remaining = deadline - SystemClock.elapsedRealtime();
        if (remaining <= 0) throw new IOException("Search timed out.");
        int timeout = (int) Math.min(4000, remaining);
        connection.setConnectTimeout(timeout); connection.setReadTimeout(timeout); connection.setInstanceFollowRedirects(false);
        ScheduledFuture<?> guard = DEADLINES.schedule(connection::disconnect, remaining, TimeUnit.MILLISECONDS);
        connection.setRequestProperty("User-Agent", USER_AGENT); connection.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
        for (Map.Entry<String, String> header : headers.entrySet()) connection.setRequestProperty(header.getKey(), header.getValue());
        process.onCancel(connection::disconnect);
        try {
            process.checkCancelled();
            if (body != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            int status = connection.getResponseCode();
            if (status != 200) throw new IOException("Search endpoint unavailable.");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int size;
                while ((size = input.read(buffer)) != -1) {
                    process.checkCancelled();
                    if (SystemClock.elapsedRealtime() >= deadline) throw new IOException("Search timed out.");
                    if (bytes.size() + size > 4 * 1024 * 1024) throw new IOException("Search response is too large.");
                    bytes.write(buffer, 0, size);
                }
                return bytes.toString(StandardCharsets.UTF_8.name());
            }
        } finally { guard.cancel(false); process.onCancel(null); connection.disconnect(); }
    }
}
