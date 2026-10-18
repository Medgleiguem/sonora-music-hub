package app.sonora.music;
import java.net.URI;
import java.util.Locale;
final class PlaybackPolicy {
    static boolean jamendo(String url) {
        try {
            URI uri = URI.create(url);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            return url.length() <= 8192 && "https".equals(uri.getScheme()) && uri.getRawUserInfo() == null
                && uri.getPort() == -1 && uri.getFragment() == null
                && (host.equals("jamendo.com") || host.endsWith(".jamendo.com"));
        } catch (Exception invalid) { return false; }
    }
    static String youtube(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{11}")) throw new IllegalArgumentException("Invalid YouTube video identifier.");
        return "https://www.youtube.com/watch?v=" + id;
    }
    static long millis(double seconds) {
        if (!Double.isFinite(seconds) || seconds < 0 || seconds > 7 * 24 * 3600) throw new IllegalArgumentException("Invalid playback position.");
        return Math.round(seconds * 1000);
    }
}
