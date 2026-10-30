package app.sonora.music;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import static org.junit.Assert.*;

/** Explicitly invoked live probe, separate from deterministic regression tests. */
@RunWith(AndroidJUnit4.class)
public class SearchLatencyProbeTest {
    @Test public void directPublicSearchReturnsTwentyFourMusicResults() throws Exception {
        long started = android.os.SystemClock.elapsedRealtime();
        JSONObject result = new YoutubeSearch().search("فيروز Fairuz", "video", new MediaProcess());
        android.util.Log.i("SonoraPerformance", "Direct search ms=" + (android.os.SystemClock.elapsedRealtime() - started));
        assertEquals(24, result.getJSONArray("entries").length());
    }

    @Test public void traceStreamResolutionStages() throws Exception {
        NativeMedia media = new NativeMedia(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext());
        media.init();
        long started = android.os.SystemClock.elapsedRealtime();
        String output = new MediaProcess().run(media.command(java.util.Arrays.asList("--verbose", "--no-playlist", "--skip-download", "--dump-single-json",
            "--format", "bestaudio[protocol=https]/best[protocol=https][acodec!=none]", "--", "https://www.youtube.com/watch?v=_D2fK-HhTvo")), 45000, null, line -> {
                if (line.startsWith("[youtube]") && !line.contains("http")) android.util.Log.i("SonoraPerformance", (android.os.SystemClock.elapsedRealtime() - started) + "ms " + line);
            });
        NativeMedia.streamResult(new JSONObject(output));
        android.util.Log.i("SonoraPerformance", "Stream resolution ms=" + (android.os.SystemClock.elapsedRealtime() - started));
    }
}
