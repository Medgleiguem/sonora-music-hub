package app.sonora.music;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.Files;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "SonoraMedia", permissions = {
    @Permission(alias = "notifications", strings = { android.Manifest.permission.POST_NOTIFICATIONS })
})
public class SonoraMediaPlugin extends Plugin {
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String, MediaProcess> running = new ConcurrentHashMap<>();
    private final AtomicInteger lookups = new AtomicInteger();
    private NativeMedia media;

    @Override public void load() {
        media = new NativeMedia(getContext());
        DownloadService.observe(this);
        if (!DownloadService.hasJob()) media.clearOldFiles();
    }

    @PluginMethod public void search(PluginCall call) { lookup(call, false); }
    @PluginMethod public void playlist(PluginCall call) { lookup(call, true); }
    @PluginMethod public void download(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED
            && !getContext().getSharedPreferences("sonora", 0).getBoolean("notificationAsked", false)) {
            requestPermissionForAlias("notifications", call, "notificationPermissionResult");
        } else startDownload(call);
    }

    @PermissionCallback private void notificationPermissionResult(PluginCall call) {
        getContext().getSharedPreferences("sonora", 0).edit().putBoolean("notificationAsked", true).apply();
        // Notification denial must not prevent a user from saving music.
        startDownload(call);
    }

    private void startDownload(PluginCall call) {
        try {
            DownloadService.Job job = DownloadService.download(getContext(), call.getString("id"), call.getString("url"), call.getString("format", "mp3"));
            job.done.whenComplete((result, error) -> {
                try {
                    if (job.cancelled) call.reject("Download cancelled. Saved tracks are kept.", "DOWNLOAD_CANCELLED");
                    else if (error instanceof MediaProcess.Failure) call.reject(error.getMessage(), ((MediaProcess.Failure) error).code);
                    else if (error != null) call.reject(error instanceof IllegalArgumentException || error instanceof IOException ? error.getMessage() : "Could not complete this download. Please retry.");
                    else call.resolve(JSObject.fromJSONObject(result));
                } catch (org.json.JSONException invalid) { call.reject("Could not read the downloaded file. Please retry."); }
            });
        } catch (Exception error) { call.reject(error.getMessage()); }
    }

    @PluginMethod public void pendingDownload(PluginCall call) {
        try { call.resolve(new JSObject().put("job", DownloadService.pending())); }
        catch (Exception error) { call.reject("Could not restore the download. Please retry."); }
    }

    @PluginMethod public void isForeground(PluginCall call) {
        call.resolve(new JSObject().put("foreground", getActivity().getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)));
    }

    @Override protected void handleOnResume() { notifyListeners("foreground", new JSObject()); }

    void emitProgress(JSONObject event) throws org.json.JSONException { notifyListeners("progress", JSObject.fromJSONObject(event)); }
    void emitCancellation(String id) { notifyListeners("downloadCancelled", new JSObject().put("id", id)); }

    private void lookup(PluginCall call, boolean playlist) {
        String id = call.getString("id");
        try { media.folder(id); } catch (Exception error) { call.reject(error.getMessage()); return; }
        if (lookups.incrementAndGet() > 2) {
            lookups.decrementAndGet(); call.reject("Search is busy. Wait a moment and retry."); return;
        }
        MediaProcess process = new MediaProcess();
        if (running.putIfAbsent(id, process) != null) {
            lookups.decrementAndGet(); call.reject("This task is already running."); return;
        }
        workers.execute(() -> {
            try { call.resolve(JSObject.fromJSONObject(media.lookup(call.getString(playlist ? "url" : "query", ""), playlist, process))); }
            catch (Exception error) {
                if (error instanceof MediaProcess.Failure) call.reject(error.getMessage(), ((MediaProcess.Failure) error).code);
                else call.reject(error instanceof IllegalArgumentException || error instanceof IOException ? error.getMessage() : "Could not complete this search. Please retry.");
            }
            finally { running.remove(id, process); lookups.decrementAndGet(); }
        });
    }

    @PluginMethod public void cancel(PluginCall call) {
        String id = call.getString("id", "");
        MediaProcess process = running.get(id);
        if (process != null) process.cancel("Search cancelled.");
        DownloadService.cancel(id, "Download cancelled. Saved tracks are kept.");
        call.resolve();
    }

    @PluginMethod public void release(PluginCall call) {
        DownloadService.release(call.getString("id", ""));
        call.resolve();
    }

    @PluginMethod public void export(PluginCall call) {
        JSONObject result = DownloadService.ready(call.getString("id", ""));
        if (result == null) { call.reject("The file is no longer available to export."); return; }
        workers.execute(() -> {
            Uri uri = null;
            try {
                String name = result.getString("title").replaceAll("[\\p{Cntrl}/\\\\:*?\"<>|]", "_").trim();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, (name.isEmpty() ? "YouTube audio" : name) + "." + result.getString("format"));
                values.put(MediaStore.Downloads.MIME_TYPE, result.getString("mime"));
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Sonora");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("Could not create the recovery copy.");
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IOException("Could not open Downloads.");
                    Files.copy(new File(result.getString("path")).toPath(), output);
                }
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, values, null, null);
                call.resolve();
            } catch (Exception error) {
                if (uri != null) getContext().getContentResolver().delete(uri, null, null);
                call.reject("Saved in Sonora, but the recovery copy failed. Check your device's free space.");
            }
        });
    }

    @PluginMethod public void minimize(PluginCall call) {
        getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
        call.resolve();
    }

    @Override protected void handleOnDestroy() {
        running.values().forEach(process -> process.cancel("Download cancelled."));
        workers.shutdownNow();
    }
}
