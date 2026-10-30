package app.sonora.music;

import org.junit.Test;
import java.util.Arrays;
import static org.junit.Assert.*;

public class DirectDownloadTest {
    @Test public void matchingCodecsAreCopiedInsteadOfReEncoded() {
        assertEquals(Arrays.asList("-c:a", "copy", "-movflags", "+faststart"), NativeMedia.audioArgs("m4a", "mp4a"));
        assertEquals(Arrays.asList("-c:a", "copy"), NativeMedia.audioArgs("opus", "opus"));
    }

    @Test public void otherCombinationsAreEncoded() {
        assertEquals("aac", NativeMedia.audioArgs("m4a", "opus").get(1));
        assertEquals("libopus", NativeMedia.audioArgs("opus", "mp4a").get(1));
        assertEquals("libmp3lame", NativeMedia.audioArgs("mp3", "mp4a").get(1));
        assertEquals("libmp3lame", NativeMedia.audioArgs("mp3", null).get(1));
    }

    @Test public void rangesAreBoundedAndStopAtAKnownLength() {
        long chunk = NativeMedia.RANGE_BYTES;
        assertEquals("bytes=0-" + (chunk - 1), NativeMedia.nextRange(0, 0));
        assertEquals("bytes=0-999", NativeMedia.nextRange(0, 1000));
        assertEquals("bytes=" + chunk + "-" + (chunk + 9), NativeMedia.nextRange(chunk, chunk + 10));
        assertNull(NativeMedia.nextRange(1000, 1000));
    }

    @Test public void contentRangeTotalIsParsedDefensively() {
        assertEquals(5_000_000L, NativeMedia.rangeTotal("bytes 0-4194303/5000000"));
        assertEquals(0L, NativeMedia.rangeTotal("bytes 0-10/*"));
        assertEquals(0L, NativeMedia.rangeTotal(null));
    }
}
