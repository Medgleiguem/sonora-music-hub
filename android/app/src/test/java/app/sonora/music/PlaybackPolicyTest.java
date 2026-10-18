package app.sonora.music;
import org.junit.Test;
import static org.junit.Assert.*;
public class PlaybackPolicyTest {
    @Test public void acceptsOnlyHttpsJamendoStreamsWithoutCredentials() {
        assertTrue(PlaybackPolicy.jamendo("https://prod-1.storage.jamendo.com/?trackid=12"));
        assertFalse(PlaybackPolicy.jamendo("http://prod-1.storage.jamendo.com/a.mp3"));
        assertFalse(PlaybackPolicy.jamendo("https://storage.jamendo.com.attacker.example/a"));
        assertFalse(PlaybackPolicy.jamendo("https://secret@storage.jamendo.com/a"));
        assertFalse(PlaybackPolicy.jamendo("https://127.0.0.1/a"));
        assertFalse(PlaybackPolicy.jamendo("https://storage.jamendo.com:444/a"));
    }
    @Test public void youtubeIdentifiersCannotInjectUrlsOrCommandOptions() {
        assertEquals("https://www.youtube.com/watch?v=dQw4w9WgXcQ", PlaybackPolicy.youtube("dQw4w9WgXcQ"));
        try { PlaybackPolicy.youtube("--exec=evil"); fail(); } catch (IllegalArgumentException expected) { }
    }
    @Test public void validatesSeekTimesAtBridgeBoundary() {
        assertEquals(1250, PlaybackPolicy.millis(1.25));
        try { PlaybackPolicy.millis(Double.NaN); fail(); } catch (IllegalArgumentException expected) { }
        try { PlaybackPolicy.millis(-1); fail(); } catch (IllegalArgumentException expected) { }
    }
}
