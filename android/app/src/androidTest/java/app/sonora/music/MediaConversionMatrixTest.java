package app.sonora.music;

import android.content.Context;
import android.media.MediaMetadataRetriever;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.util.*;
import static org.junit.Assert.*;

/** Every source shape the extractor hands FFmpeg, into every output format; guards Sonora Lite's audio-only FFmpeg. */
@RunWith(AndroidJUnit4.class)
public class MediaConversionMatrixTest {
    @Test(timeout = 600000) public void everySourceConvertsToEveryFormat() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NativeMedia media = new NativeMedia(context);
        media.init();
        List<String> failures = new ArrayList<>();
        // Opus WebM, AAC M4A (with the M4A container fixup) and HLS AAC (with the MPEG-TS fixup).
        for (String source : Arrays.asList("251", "140", "234")) {
            for (String format : Arrays.asList("mp3", "m4a", "opus")) {
                File directory = new File(context.getCacheDir(), "conversion-matrix/" + source + "-" + format);
                NativeMedia.delete(directory);
                directory.mkdirs();
                try {
                    new MediaProcess().run(media.command(Arrays.asList("--no-playlist", "--format", source, "--extract-audio",
                        "--audio-format", format, "--audio-quality", "192K", "--postprocessor-args", "ffmpeg:-threads 1",
                        "--output", new File(directory, "audio.%(ext)s").getAbsolutePath(), "--", "https://www.youtube.com/watch?v=jNQXAC9IVRw"))
                        .directory(directory), 120_000, directory, line -> {});
                    File audio = new File(directory, "audio." + format);
                    NativeMedia.validateAudio(audio);
                    try (MediaMetadataRetriever metadata = new MediaMetadataRetriever()) {
                        metadata.setDataSource(audio.getAbsolutePath());
                        long duration = Long.parseLong(metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
                        if (duration < 18000 || duration > 22000) failures.add(source + " -> " + format + ": duration " + duration);
                    }
                } catch (Exception error) {
                    failures.add(source + " -> " + format + ": " + error.getMessage());
                } finally { NativeMedia.delete(directory); }
            }
        }
        assertTrue(failures.toString(), failures.isEmpty());
    }
}
