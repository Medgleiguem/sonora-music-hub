package app.sonora.music;

import android.os.SystemClock;
import android.util.Log;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.util.*;
import static org.junit.Assert.*;

/** Live comparison of the direct path with the previous extractor-only path. Requires network access. */
@RunWith(AndroidJUnit4.class)
public class DownloadSpeedProbeTest {
    private static final String SONG = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    @Test(timeout = 600000) public void directDownloadIsFasterThanTheExtractor() throws Exception {
        NativeMedia media = new NativeMedia(InstrumentationRegistry.getInstrumentation().getTargetContext());
        media.init();
        long direct = 0;
        for (String format : Arrays.asList("m4a", "mp3")) {
            String id = UUID.randomUUID().toString();
            long start = SystemClock.elapsedRealtime();
            try {
                JSONObject result = media.download(SONG, format, id, new MediaProcess(), event -> {});
                long elapsed = SystemClock.elapsedRealtime() - start;
                if ("mp3".equals(format)) direct = elapsed;
                Log.i("SonoraSpeed", format + " via " + result.getString("downloader") + ": " + elapsed + " ms, " + result.getLong("size") + " bytes");
                assertEquals("native", result.getString("downloader"));
            } finally { media.release(id); }
        }
        // The previous path for the same song: one extractor process that downloads and converts.
        File directory = media.folder(UUID.randomUUID().toString());
        directory.mkdirs();
        long start = SystemClock.elapsedRealtime();
        try {
            new MediaProcess().run(media.command(Arrays.asList("--no-playlist", "--format", "bestaudio/best", "--extract-audio", "--audio-format", "mp3",
                "--audio-quality", "192K", "--postprocessor-args", "ffmpeg:-threads 1", "--output", new File(directory, "audio.%(ext)s").getAbsolutePath(), "--", SONG)).directory(directory),
                400_000, directory, line -> {});
            long extractor = SystemClock.elapsedRealtime() - start;
            Log.i("SonoraSpeed", "mp3 via extractor: " + extractor + " ms");
            assertTrue("Direct MP3 (" + direct + " ms) should beat the extractor (" + extractor + " ms)", direct < extractor);
        } finally { NativeMedia.delete(directory); }
    }
}
