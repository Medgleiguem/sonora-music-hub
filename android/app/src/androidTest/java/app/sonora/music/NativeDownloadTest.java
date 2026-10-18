package app.sonora.music;

import android.content.Context;
import android.media.MediaMetadataRetriever;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeDownloadTest {
    @Test(timeout = 240000)
    public void realYoutubeToMp3OnDevice() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NativeMedia media = new NativeMedia(context);
        String id = UUID.randomUUID().toString();
        Set<String> stages = ConcurrentHashMap.newKeySet();
        JSONObject result = media.download("https://www.youtube.com/watch?v=jNQXAC9IVRw", "mp3", id, new MediaProcess(), event -> stages.add(event.optString("stage")));
        File output = new File(result.getString("path"));
        assertTrue("A real MP3 must be downloaded", output.length() > 10000);
        assertEquals(output.length(), result.getLong("size"));
        assertEquals("Me at the zoo", result.getString("title"));
        assertTrue(stages.contains("downloading"));
        assertTrue(stages.contains("converting"));
        try (MediaMetadataRetriever metadata = new MediaMetadataRetriever()) {
            metadata.setDataSource(output.getAbsolutePath());
            long duration = Long.parseLong(metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
            assertTrue("Expected 19-second public test clip", duration > 18000 && duration < 22000);
        }
        media.release(id);
        assertFalse(output.exists());
    }

    @Test public void rejectsUntrustedSourcesAndPaths() {
        for (String value : Arrays.asList("https://evil.example/watch?v=jNQXAC9IVRw", "https://youtube.com@evil.example/watch?v=jNQXAC9IVRw", "file:///etc/passwd", "https://youtube.com:999/watch?v=jNQXAC9IVRw", "--exec=evil")) {
            assertThrows(IllegalArgumentException.class, () -> NativeMedia.source(value, false));
        }
        NativeMedia media = new NativeMedia(InstrumentationRegistry.getInstrumentation().getTargetContext());
        assertThrows(IllegalArgumentException.class, () -> media.folder("../../files"));
        assertEquals("https://www.youtube.com/watch?v=jNQXAC9IVRw", NativeMedia.source("https://youtu.be/jNQXAC9IVRw?t=3", false));
    }

    @Test(timeout = 240000) public void otherAudioFormatsArePlayable() throws Exception {
        NativeMedia media = new NativeMedia(InstrumentationRegistry.getInstrumentation().getTargetContext());
        for (String format : Arrays.asList("m4a", "opus")) {
            String id = UUID.randomUUID().toString();
            try {
                JSONObject result = media.download("https://youtu.be/jNQXAC9IVRw", format, id, new MediaProcess(), event -> {});
                try (MediaMetadataRetriever metadata = new MediaMetadataRetriever()) {
                    metadata.setDataSource(result.getString("path"));
                    long duration = Long.parseLong(metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
                    assertTrue(format + " must decode correctly", duration > 18000 && duration < 22000);
                }
            } finally { media.release(id); }
        }
    }

    @Test(timeout = 30000) public void cancellationStopsChildProcessesAndAllowsRetry() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NativeMedia media = new NativeMedia(context);
        media.init();
        File marker = new File(context.getCacheDir(), "cancel-child-marker");
        marker.delete();
        MediaProcess process = new MediaProcess();
        CountDownLatch started = new CountDownLatch(1);
        ProcessBuilder builder = media.command(Collections.emptyList());
        String python = builder.command().get(0);
        String child = "import time; time.sleep(2); open(" + JSONObject.quote(marker.getAbsolutePath()) + ",'w').write('orphan')";
        String script = "import os,sys,subprocess,time; os.setsid(); print('SONORA_PID='+str(os.getpid()),file=sys.stderr,flush=True); subprocess.Popen([sys.executable,'-c'," + JSONObject.quote(child) + "]); print('ready',flush=True); time.sleep(20)";
        builder.command(python, "-c", script);
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            Future<String> result = worker.submit(() -> process.run(builder, 10000, null, line -> started.countDown()));
            assertTrue(started.await(10, TimeUnit.SECONDS));
            process.cancel("Cancelled by test");
            assertThrows(ExecutionException.class, () -> result.get(5, TimeUnit.SECONDS));
            Thread.sleep(2500);
            assertFalse("Cancellation must stop the child too", marker.exists());
            String version = new MediaProcess().run(media.command(Arrays.asList("--version")), 10000, null, line -> {});
            assertTrue("The next task can run", version.matches("(?s).*20[0-9]{2}\\.[0-9]{2}\\.[0-9]{2}.*"));
        } finally { worker.shutdownNow(); }
    }

    @Test(timeout = 30000) public void timeoutAndOutputLimitsStopProcesses() throws Exception {
        NativeMedia media = new NativeMedia(InstrumentationRegistry.getInstrumentation().getTargetContext());
        media.init();
        ProcessBuilder wait = media.command(Collections.emptyList());
        String python = wait.command().get(0);
        wait.command(python, "-c", "import time; time.sleep(20)");
        long start = System.nanoTime();
        assertThrows(Exception.class, () -> new MediaProcess().run(wait, 250, null, line -> {}));
        assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 5000);
        ProcessBuilder flood = media.command(Collections.emptyList());
        flood.command(python, "-c", "import sys; sys.stdout.write('a'*5000000)");
        assertThrows(Exception.class, () -> new MediaProcess().run(flood, 10000, null, line -> {}));
    }
}
