package app.sonora.music;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import androidx.core.app.NotificationCompat;
import org.json.*;
import java.io.IOException;
import java.lang.ref.WeakReference;
import java.util.*;
import java.util.concurrent.*;

/**
 * Owns native download jobs independently of the Activity and its WebView. Several songs download at once;
 * further jobs wait in order. The service stays up briefly between songs, so the next one can be queued
 * while Sonora is in the background without starting a new foreground service.
 */
public final class DownloadService extends Service {
    static final int PARALLEL = 3;
    static final int MAX_JOBS = 8;
    private static final long JOB_TIMEOUT_MS = 5 * 60_000L;
    private static final long IDLE_STOP_MS = 15_000L;
    private static final String CHANNEL = "sonora-downloads";
    private static final int NOTIFICATION = 41;
    private static final String CANCEL = "app.sonora.music.CANCEL_DOWNLOAD";
    private static final ExecutorService workers = Executors.newFixedThreadPool(PARALLEL);
    private static final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor();
    private static final Handler main = new Handler(Looper.getMainLooper());
    // Insertion order is queue order; guarded by DownloadService.class.
    private static final Map<String, Job> jobs = new LinkedHashMap<>();
    // Downloads the app is still working through (for example, reading a playlist). Each keeps the service
    // running between songs, so leaving Sonora at any point never needs a background service start.
    private static final Set<String> holds = new HashSet<>();
    private static NativeMedia media;
    private static boolean requested;
    private static volatile WeakReference<SonoraMediaPlugin> observer = new WeakReference<>(null);
    private static volatile DownloadService instance;
    private PowerManager.WakeLock wakeLock;
    private int lastStartId;
    private boolean idleStopped;
    private long lastUpdate;
    private String lastText = "";

    static final class Job {
        final String id, url, format;
        final MediaProcess process = new MediaProcess();
        final CompletableFuture<JSONObject> done = new CompletableFuture<>();
        volatile JSONObject result;
        volatile String stage = "waiting";
        volatile long loaded, total;
        volatile boolean cancelled, running, finished, releaseRequested;
        Job(String id, String url, String format) { this.id = id; this.url = url; this.format = format; }
    }

    /** Android refuses to start a foreground service from the background; the app retries once it is visible. */
    static final class StartRefused extends IOException {
        StartRefused(Throwable cause) { super("Reopen Sonora to start this download.", cause); }
    }

    static void observe(SonoraMediaPlugin plugin) { observer = new WeakReference<>(plugin); }
    static synchronized boolean hasJob() { return !jobs.isEmpty(); }

    static void hold(Context context, String id) throws Exception {
        synchronized (DownloadService.class) {
            if (holds.size() >= 32) throw new IOException("Too many downloads are running. Wait for one to finish.");
            holds.add(id);
            if (!requested) {
                try { context.startForegroundService(new Intent(context, DownloadService.class)); }
                catch (RuntimeException error) { holds.remove(id); throw new StartRefused(error); }
                requested = true;
            }
        }
        main.post(DownloadService::refresh);
    }

    static void unhold(String id) {
        synchronized (DownloadService.class) { if (!holds.remove(id)) return; }
        main.post(DownloadService::refresh);
    }
    static synchronized boolean isRunning() { return requested; }

    static Job download(Context context, String id, String url, String format) throws Exception {
        url = NativeMedia.source(url, false);
        if (!Arrays.asList("mp3", "m4a", "opus").contains(format)) throw new IllegalArgumentException("Choose MP3, M4A, or Opus.");
        Job job;
        synchronized (DownloadService.class) {
            Job existing = jobs.get(id);
            if (existing != null) {
                if (existing.url.equals(url) && existing.format.equals(format)) return existing;
                throw new IOException("This download is already running. Retry in a moment.");
            }
            if (jobs.size() >= MAX_JOBS) throw new IOException("Too many songs are downloading. Wait for one to finish and retry.");
            if (media == null) media = new NativeMedia(context.getApplicationContext());
            media.folder(id);
            job = new Job(id, url, format);
            jobs.put(id, job);
            if (!requested) {
                try { context.startForegroundService(new Intent(context, DownloadService.class)); }
                catch (RuntimeException error) { jobs.remove(id); throw new StartRefused(error); }
                requested = true;
            }
        }
        main.post(DownloadService::refresh);
        workers.execute(() -> run(job));
        return job;
    }

    private static void run(Job job) {
        if (job.cancelled) {
            job.done.completeExceptionally(new IOException("Download cancelled."));
            finish(job);
            return;
        }
        job.running = true;
        job.stage = "preparing";
        main.post(DownloadService::refresh);
        // A stalled song fails on its own rather than stopping the other downloads.
        ScheduledFuture<?> watchdog = timers.schedule(() -> job.process.cancel("The download timed out. Retry this song."), JOB_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        try {
            job.result = media.download(job.url, job.format, job.id, job.process, event -> {
                try {
                    job.stage = event.optString("stage", job.stage);
                    job.loaded = event.optLong("loaded");
                    job.total = event.optLong("total");
                    event.put("id", job.id);
                    main.post(DownloadService::refresh);
                    SonoraMediaPlugin plugin = observer.get();
                    if (plugin != null) plugin.emitProgress(event);
                } catch (JSONException ignored) { }
            });
            job.stage = "storing";
            job.done.complete(job.result);
        } catch (Exception error) {
            if (BuildConfig.DEBUG) android.util.Log.w("SonoraDownloader", "Download failed", error);
            job.done.completeExceptionally(error);
            job.releaseRequested = true;
        } finally {
            watchdog.cancel(false);
            finish(job);
        }
    }

    private static void finish(Job job) {
        job.running = false;
        job.finished = true;
        if (job.releaseRequested || job.cancelled) release(job.id);
        else main.post(DownloadService::refresh);
    }

    static synchronized JSONArray pending() throws JSONException {
        JSONArray result = new JSONArray();
        for (Job job : jobs.values()) result.put(new JSONObject().put("id", job.id).put("url", job.url).put("format", job.format)
            .put("ready", job.result != null).put("cancelled", job.cancelled));
        return result;
    }

    static synchronized JSONObject ready(String id) {
        Job job = jobs.get(id);
        return job != null && !job.cancelled ? job.result : null;
    }

    /** @param announce tell the app, for cancellations it did not request itself (notification, system). */
    static void cancel(String id, String reason, boolean announce) {
        Job job;
        synchronized (DownloadService.class) { job = jobs.get(id); }
        if (job == null) return;
        job.cancelled = true;
        job.process.cancel(reason);
        SonoraMediaPlugin plugin = observer.get();
        if (announce && plugin != null) plugin.emitCancellation(id);
        if (job.finished) release(id);
    }

    static void cancelAll(String reason) {
        List<String> ids;
        synchronized (DownloadService.class) { ids = new ArrayList<>(jobs.keySet()); }
        for (String id : ids) cancel(id, reason, true);
    }

    static void release(String id) {
        synchronized (DownloadService.class) {
            Job job = jobs.get(id);
            if (job == null) return;
            job.releaseRequested = true;
            if (!job.finished) return;
            jobs.remove(id);
            media.release(id);
        }
        main.post(DownloadService::refresh);
    }

    /** Main thread: updates the notification, or stops the service after a short idle period. */
    private static void refresh() {
        DownloadService service = instance;
        if (service == null) return;
        main.removeCallbacks(idleStop);
        int running = 0, waiting = 0, ready = 0;
        Job single = null;
        synchronized (DownloadService.class) {
            if (jobs.isEmpty() && holds.isEmpty()) {
                if (service.wakeLock.isHeld()) service.wakeLock.release();
                if (!"Downloads finished".equals(service.lastText)) {
                    service.lastText = "Downloads finished";
                    service.getSystemService(NotificationManager.class).notify(NOTIFICATION, service.notification(service.lastText, 0, 0, false));
                }
                main.postDelayed(idleStop, IDLE_STOP_MS);
                return;
            }
            for (Job job : jobs.values()) {
                if (job.running) { running++; single = job; }
                else if (job.finished) ready++;
                else waiting++;
            }
        }
        boolean busy;
        synchronized (DownloadService.class) { busy = running > 0 || !holds.isEmpty(); }
        // Re-acquired with a timeout on each refresh, so a lost release can never hold the CPU awake indefinitely.
        if (busy) service.wakeLock.acquire(JOB_TIMEOUT_MS * 2);
        else if (service.wakeLock.isHeld()) service.wakeLock.release();
        String text = running == 1 && waiting == 0 ? ("converting".equals(single.stage) ? "Converting audio…" : "downloading".equals(single.stage) ? "Downloading audio…" : "Preparing your download…")
            : running > 0 ? "Downloading " + running + " songs" + (waiting > 0 ? " · " + waiting + " waiting" : "")
            : ready > 0 ? "Saving to your library…" : "Preparing your downloads…";
        long now = SystemClock.elapsedRealtime();
        if (text.equals(service.lastText) && now - service.lastUpdate < 1000) return;
        service.lastUpdate = now;
        service.lastText = text;
        long loaded = running == 1 ? single.loaded : 0, total = running == 1 ? single.total : 0;
        service.getSystemService(NotificationManager.class).notify(NOTIFICATION, service.notification(text, loaded, total, running > 0));
    }

    private static final Runnable idleStop = () -> {
        synchronized (DownloadService.class) {
            DownloadService service = instance;
            if (!jobs.isEmpty() || !holds.isEmpty() || service == null) return;
            // A start delivered after this point keeps the service alive; requested lets it be started again.
            if (service.stopSelfResult(service.lastStartId)) { requested = false; service.idleStopped = true; }
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Music downloads", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Progress and cancellation for downloads you start in Sonora");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
        wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Sonora:Download");
        wakeLock.setReferenceCounted(false);
        startForeground(NOTIFICATION, notification("Preparing your download…", 0, 0, true), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        lastStartId = startId;
        if (intent != null && CANCEL.equals(intent.getAction())) cancelAll("Downloads cancelled. Saved tracks are kept.");
        else {
            // Every start must promote the service, including one that arrives while it is stopping.
            startForeground(NOTIFICATION, notification("Preparing your download…", 0, 0, true), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            lastText = "";
        }
        refresh();
        return START_NOT_STICKY;
    }

    private Notification notification(String text, long loaded, long total, boolean active) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_download).setContentTitle("Saving your music").setContentText(text)
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setCategory(NotificationCompat.CATEGORY_PROGRESS);
        if (active) builder.setProgress(100, total > 0 ? (int) Math.min(100, loaded * 100 / total) : 0, total <= 0);
        if (!"Downloads finished".equals(text)) {
            Intent cancel = new Intent(this, DownloadService.class).setAction(CANCEL);
            builder.addAction(0, "Cancel all", PendingIntent.getService(this, 1, cancel, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        return builder.build();
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        synchronized (DownloadService.class) { holds.clear(); }
        cancelAll("Sonora was closed. Saved tracks are kept; reopen and retry.");
        stopSelf();
    }

    @Override public void onTimeout(int startId, int fgsType) { onTaskRemoved(null); }

    @Override public void onDestroy() {
        main.removeCallbacks(idleStop);
        // After an idle stop, jobs queued since then belong to the next service start.
        if (!idleStopped) {
            synchronized (DownloadService.class) { requested = false; }
            cancelAll("Android stopped the download. Reopen Sonora and retry; saved tracks are kept.");
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
