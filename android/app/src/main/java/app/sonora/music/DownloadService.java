package app.sonora.music;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import androidx.core.app.NotificationCompat;
import org.json.*;
import java.io.IOException;
import java.lang.ref.WeakReference;
import java.util.concurrent.*;

/** Owns the native job independently of the Activity and its WebView. */
public final class DownloadService extends Service {
    private static final String CHANNEL = "sonora-downloads";
    private static final int NOTIFICATION = 41;
    private static final String CANCEL = "app.sonora.music.CANCEL_DOWNLOAD";
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static volatile Job active;
    private static volatile WeakReference<SonoraMediaPlugin> observer = new WeakReference<>(null);
    private static volatile DownloadService instance;
    private PowerManager.WakeLock wakeLock;
    private String id;
    private long lastUpdate;
    private String lastStage = "";

    static final class Job {
        final String id, url, format;
        final NativeMedia media;
        final MediaProcess process = new MediaProcess();
        final CompletableFuture<JSONObject> done = new CompletableFuture<>();
        volatile JSONObject result;
        volatile boolean cancelled, finished, releaseRequested;
        Job(Context context, String id, String url, String format) {
            this.id = id; this.url = url; this.format = format;
            media = new NativeMedia(context);
        }
    }

    static void observe(SonoraMediaPlugin plugin) { observer = new WeakReference<>(plugin); }
    static boolean hasJob() { return active != null; }

    static synchronized Job download(Context context, String id, String url, String format) throws Exception {
        url = NativeMedia.source(url, false);
        if (!java.util.Arrays.asList("mp3", "m4a", "opus").contains(format)) throw new IllegalArgumentException("Choose MP3, M4A, or Opus.");
        if (active != null) {
            if (active.id.equals(id) && active.url.equals(url) && active.format.equals(format)) return active;
            throw new IOException("Another download is still running. Open its details or cancel it first.");
        }
        Job job = new Job(context.getApplicationContext(), id, url, format);
        job.media.folder(id);
        active = job;
        try { context.startForegroundService(new Intent(context, DownloadService.class).putExtra("id", id)); }
        catch (RuntimeException error) { active = null; throw new IOException("Android could not start the download. Keep Sonora visible and retry.", error); }
        worker.execute(() -> {
            try {
                job.result = job.media.download(job.url, job.format, job.id, job.process, event -> {
                    try {
                        event.put("id", job.id);
                        progress(job.id, event.optString("stage"), event.optLong("loaded"), event.optLong("total"));
                        SonoraMediaPlugin plugin = observer.get();
                        if (plugin != null) plugin.emitProgress(event);
                    } catch (JSONException ignored) { }
                });
                progress(job.id, "storing", 0, 0);
                job.done.complete(job.result);
            } catch (Exception error) {
                if (BuildConfig.DEBUG) android.util.Log.w("SonoraDownloader", "Download failed", error);
                job.done.completeExceptionally(error);
                job.releaseRequested = true;
            } finally {
                job.finished = true;
                if (job.releaseRequested || job.cancelled) release(job.id);
            }
        });
        return job;
    }

    static JSONObject pending() throws JSONException {
        Job job = active;
        return job == null ? null : new JSONObject().put("id", job.id).put("url", job.url).put("format", job.format)
            .put("ready", job.result != null).put("cancelled", job.cancelled);
    }

    static JSONObject ready(String id) {
        Job job = active;
        return job != null && job.id.equals(id) && !job.cancelled ? job.result : null;
    }

    static void cancel(String id, String reason) {
        Job job = active;
        if (job == null || !job.id.equals(id)) return;
        job.cancelled = true;
        job.process.cancel(reason);
        SonoraMediaPlugin plugin = observer.get();
        if (plugin != null) plugin.emitCancellation(id);
        if (job.finished) release(id);
    }

    static synchronized void release(String id) {
        Job job = active;
        if (job == null || !job.id.equals(id)) return;
        job.releaseRequested = true;
        if (!job.finished) return;
        job.media.release(id);
        active = null;
        DownloadService service = instance;
        if (service != null) main.post(() -> { if (active == null) service.stopSelf(); });
    }

    private static void progress(String id, String stage, long loaded, long total) {
        main.post(() -> {
            DownloadService service = instance;
            if (service == null || !id.equals(service.id) || active == null) return;
            long now = SystemClock.elapsedRealtime();
            if (stage.equals(service.lastStage) && now - service.lastUpdate < 1000) return;
            service.lastUpdate = now;
            service.lastStage = stage;
            String text = "converting".equals(stage) ? "Converting audio…"
                : "storing".equals(stage) ? "Audio ready. Open Sonora to finish saving."
                : "downloading".equals(stage) ? "Downloading audio…" : "Preparing your download…";
            service.getSystemService(NotificationManager.class).notify(NOTIFICATION, service.notification(text, loaded, total));
        });
    }

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        Job job = active;
        id = job == null ? null : job.id;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Music downloads", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Progress and cancellation for downloads you start in Sonora");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
        startForeground(NOTIFICATION, notification("Preparing your download…", 0, 0), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Sonora:Download");
        wakeLock.acquire(5 * 60_000L);
        main.postDelayed(expire, 5 * 60_000L);
    }

    private final Runnable expire = () -> {
        if (id != null) cancel(id, "Download timed out. Reopen Sonora and retry; saved tracks are kept.");
        stopSelf();
    };

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        String requestedId = intent.getStringExtra("id");
        if (CANCEL.equals(intent.getAction())) {
            if (requestedId != null) cancel(requestedId, "Download cancelled. Saved tracks are kept.");
        } else {
            id = requestedId;
            Job job = active;
            if (job == null || !job.id.equals(id)) stopSelf();
            else {
                lastStage = "";
                lastUpdate = 0;
                // Reset the bound for the next playlist item if Android reused this Service.
                main.removeCallbacks(expire);
                main.postDelayed(expire, 5 * 60_000L);
                if (wakeLock.isHeld()) wakeLock.release();
                wakeLock.acquire(5 * 60_000L);
                getSystemService(NotificationManager.class).notify(NOTIFICATION, notification("Preparing your download…", 0, 0));
            }
        }
        return START_NOT_STICKY;
    }

    private Notification notification(String text, long loaded, long total) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_download).setContentTitle("Saving your music").setContentText(text)
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setCategory(NotificationCompat.CATEGORY_PROGRESS);
        if (!"storing".equals(lastStage)) builder.setProgress(100, total > 0 ? (int) Math.min(100, loaded * 100 / total) : 0, total <= 0);
        if (id != null) {
            Intent cancel = new Intent(this, DownloadService.class).setAction(CANCEL).putExtra("id", id);
            PendingIntent action = PendingIntent.getService(this, id.hashCode(), cancel, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            builder.addAction(0, "Cancel", action);
        }
        return builder.build();
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        if (id != null) cancel(id, "Sonora was closed. Saved tracks are kept; reopen and retry.");
        stopSelf();
    }

    @Override public void onTimeout(int startId, int fgsType) { onTaskRemoved(null); }

    @Override public void onDestroy() {
        main.removeCallbacks(expire);
        if (id != null) cancel(id, "Android stopped the download. Reopen Sonora and retry; saved tracks are kept.");
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
