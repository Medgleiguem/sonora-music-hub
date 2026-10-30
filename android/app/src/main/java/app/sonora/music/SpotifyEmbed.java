package app.sonora.music;

import android.os.SystemClock;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Reads the public song list of a Spotify playlist, album or song. Audio always comes from YouTube. */
final class SpotifyEmbed {
    private static final String USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    private static final String MARKER = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
    private SpotifyEmbed() {}

    static URL address(String kind, String id) throws IOException {
        if (!Arrays.asList("playlist", "album", "track").contains(kind) || id == null || !id.matches("[A-Za-z0-9]{22}"))
            throw new IllegalArgumentException("Paste a Spotify playlist, album, or song link.");
        return new URL("https://open.spotify.com/embed/" + kind + "/" + id);
    }

    /** Only the page's data block crosses the bridge; the shared web code validates its contents. */
    static String data(String html) throws IOException {
        int start = html.indexOf(MARKER);
        int end = start < 0 ? -1 : html.indexOf("</script>", start + MARKER.length());
        if (end < 0) throw new IOException("Spotify did not return this link’s songs. Try again later.");
        return html.substring(start + MARKER.length(), end);
    }

    static String load(String kind, String id, MediaProcess process) throws Exception {
        URL url = address(kind, id);
        long deadline = SystemClock.elapsedRealtime() + 15_000;
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(8000); connection.setReadTimeout(8000); connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("User-Agent", USER_AGENT); connection.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
        process.onCancel(connection::disconnect);
        try {
            process.checkCancelled();
            if (connection.getResponseCode() != 200) throw new IOException("Spotify is unavailable. Try again later.");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int size;
                while ((size = input.read(buffer)) != -1) {
                    process.checkCancelled();
                    if (SystemClock.elapsedRealtime() >= deadline) throw new IOException("Spotify took too long to respond. Try again.");
                    if (bytes.size() + size > 4 * 1024 * 1024) throw new IOException("The Spotify response is too large.");
                    bytes.write(buffer, 0, size);
                }
                return data(bytes.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { process.onCancel(null); connection.disconnect(); }
    }
}
