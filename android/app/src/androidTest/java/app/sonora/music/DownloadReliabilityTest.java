package app.sonora.music;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.Arrays;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DownloadReliabilityTest {
    @Test public void downloadFailuresExplainTheRecoveryAction() {
        assertTrue(MediaProcess.publicError("ERROR: Requested format is not available").contains("update"));
        assertTrue(MediaProcess.publicError("No space left on device").contains("space"));
        assertTrue(MediaProcess.publicError("CERTIFICATE_VERIFY_FAILED").contains("date"));
    }

    @Test(timeout = 30000) public void concurrentEngineUpgradeKeepsACompleteExecutable() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        new NativeMedia(context).init();
        File version = new File(context.getNoBackupFilesDir(), "sonora-engine/version.json");
        Files.write(version.toPath(), "{\"version\":\"outdated\"}".getBytes(StandardCharsets.UTF_8));
        ExecutorService workers = Executors.newFixedThreadPool(4);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> installs = new ArrayList<>();
        try {
            for (int i = 0; i < 4; i++) installs.add(workers.submit(() -> {
                start.await(); new NativeMedia(context).init(); return null;
            }));
            start.countDown();
            for (Future<?> install : installs) install.get(20, TimeUnit.SECONDS);
            NativeMedia media = new NativeMedia(context); media.init();
            String output = new MediaProcess().run(media.command(Arrays.asList("--version")), 10000, null, line -> {});
            assertTrue(output.contains("2026.10.10.233141"));
        } finally { workers.shutdownNow(); }
    }

    @Test(timeout = 30000) public void installedEngineIsCurrentAndIncludesChallengeScripts() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        NativeMedia media = new NativeMedia(context);
        media.init();
        String version = new MediaProcess().run(media.command(Arrays.asList("--version")), 10000, null, line -> {});
        assertTrue("The old 2025 engine must be replaced on upgrades too: " + version, version.contains("2026.10.10.233141"));
        // Android's Java ZIP reader rejects the executable shebang prefix; use the
        // same Python ZIP implementation that actually loads this pinned engine.
        ProcessBuilder inspect = media.command(java.util.Collections.emptyList());
        String python = inspect.command().get(0);
        String script = "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); "
            + "names=['yt_dlp_ejs/yt/solver/core.min.js','yt_dlp_ejs/yt/solver/lib.min.js']; "
            + "assert all(z.read(name) for name in names), 'Missing challenge solver scripts'; "
            + "print('SONORA_EJS_BUNDLE_VERIFIED')";
        inspect.command(python, "-c", script, new File(context.getNoBackupFilesDir(), "sonora-engine/yt-dlp").getAbsolutePath());
        String bundle = new MediaProcess().run(inspect, 10000, null, line -> {});
        assertTrue("Matching YouTube solver scripts must be readable by the bundled Python runtime", bundle.contains("SONORA_EJS_BUNDLE_VERIFIED"));
    }
}
