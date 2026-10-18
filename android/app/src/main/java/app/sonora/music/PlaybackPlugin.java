package app.sonora.music;

import android.content.*;
import android.os.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.media3.common.util.UnstableApi;
import org.json.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;

/** App-only bridge. External MediaControllers receive a separate transport-only surface. */
@UnstableApi
@CapacitorPlugin(name = "SonoraPlayer")
public class PlaybackPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService copies = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(8));
    private final Set<String> ownedUploads = ConcurrentHashMap.newKeySet();
    private final List<Runnable> waiting = new ArrayList<>();
    private PlaybackService service;
    private boolean bound, destroyed;
    private final PlaybackService.Observer observer = state -> {
        try { notifyListeners("state", JSObject.fromJSONObject(state)); }
        catch (JSONException ignored) { }
    };
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            if (destroyed) return;
            service = ((PlaybackService.LocalBinder)binder).service();
            service.observe(observer);
            for (Runnable command : new ArrayList<>(waiting)) command.run();
            waiting.clear();
        }
        @Override public void onServiceDisconnected(ComponentName name) { service = null; }
        @Override public void onBindingDied(ComponentName name) { service = null; }
    };
    @Override public void load() {
        main.post(() -> {
            Intent intent = new Intent(getContext(), PlaybackService.class).setAction(PlaybackService.LOCAL_BIND);
            bound = getContext().getApplicationContext().bindService(intent, connection, Context.BIND_AUTO_CREATE);
        });
    }
    @Override protected void handleOnResume() { main.post(() -> { if (service != null) observer.state(service.snapshot()); }); }
    @Override protected void handleOnDestroy() {
        main.post(() -> {
            destroyed = true;
            PlaybackService previous = service;
            if (previous != null) previous.unobserve(observer);
            if (bound) { getContext().getApplicationContext().unbindService(connection); bound = false; }
            service = null;
            Runnable cleanup = () -> {
                if (previous != null && previous.store != null) for (String id : ownedUploads) try { previous.store.abort(id); } catch (IOException ignored) { }
                ownedUploads.clear();
            };
            try { copies.execute(cleanup); } catch (RejectedExecutionException full) { cleanup.run(); }
            copies.shutdown();
            for (Runnable command : new ArrayList<>(waiting)) command.run();
            waiting.clear();
        });
    }
    private interface Command { void run(PlaybackService service) throws Exception; }
    private void command(PluginCall call, Command action) {
        main.post(() -> {
            Runnable execute = () -> {
                if (destroyed || service == null) { call.reject("The native player is unavailable. Reopen the app and retry."); return; }
                try { action.run(service); } catch (Exception failed) { reject(call, failed); }
            };
            if (service != null || destroyed) execute.run();
            else if (!bound) call.reject("The native player could not start. Reopen the app and retry.");
            else if (waiting.size() >= 32) call.reject("The native player is busy. Retry in a moment.");
            else waiting.add(execute);
        });
    }
    private static void reject(PluginCall call, Exception error) {
        String message = error instanceof IllegalArgumentException || error instanceof IOException ? error.getMessage() : null;
        if (message == null || message.length() > 300 || message.contains("://")) message = "The native player could not complete this action. Retry.";
        call.reject(message);
    }
    private void answer(PluginCall call, PlaybackService service) throws JSONException { call.resolve(JSObject.fromJSONObject(service.snapshot())); }
    @PluginMethod public void state(PluginCall call) { command(call, service -> answer(call, service)); }
    @PluginMethod public void setQueue(PluginCall call) { command(call, service -> {
        service.setQueue(call.getArray("items"), call.getInt("index", 0), call.getDouble("position", 0.0), call.getString("requestId", "")); answer(call, service);
    }); }
    @PluginMethod public void play(PluginCall call) { command(call, service -> { service.play(); answer(call, service); }); }
    @PluginMethod public void pause(PluginCall call) { command(call, service -> { service.pause(); answer(call, service); }); }
    @PluginMethod public void next(PluginCall call) { command(call, service -> { service.next(); answer(call, service); }); }
    @PluginMethod public void previous(PluginCall call) { command(call, service -> { service.previous(); answer(call, service); }); }
    @PluginMethod public void seek(PluginCall call) { command(call, service -> { service.seek(call.getDouble("position", 0.0)); answer(call, service); }); }
    @PluginMethod public void setOptions(PluginCall call) { command(call, service -> { service.options(call.getData()); answer(call, service); }); }
    @PluginMethod public void select(PluginCall call) { command(call, service -> { service.select(call.getString("id", "")); answer(call, service); }); }
    @PluginMethod public void add(PluginCall call) { command(call, service -> { service.add(call.getObject("item"), call.getBoolean("next", false)); answer(call, service); }); }
    @PluginMethod public void insert(PluginCall call) { command(call, service -> { service.insert(call.getObject("item"), call.getInt("index", -1), call.getString("requestId", "")); answer(call, service); }); }
    @PluginMethod public void clearUpcoming(PluginCall call) { command(call, service -> { service.clearUpcoming(); answer(call, service); }); }
    @PluginMethod public void remove(PluginCall call) { command(call, service -> { service.remove(call.getString("id", "")); answer(call, service); }); }
    @PluginMethod public void removeMedia(PluginCall call) { command(call, service -> { service.removeMedia(call.getString("id", "")); call.resolve(); }); }
    @PluginMethod public void stageStart(PluginCall call) { command(call, service -> {
        PlaybackStore store = service.requireStore();
        String id = call.getString("id", ""); Double size = call.getDouble("size");
        if (size == null || !Double.isFinite(size) || size != Math.floor(size)) throw new IllegalArgumentException("Invalid audio file size.");
        copies.execute(() -> {
            try {
                PlaybackStore.Stage stage = store.start(id, size.longValue());
                if (stage.uploadId != null) ownedUploads.add(stage.uploadId);
                JSObject result = new JSObject();
                if (stage.uri != null) result.put("uri", stage.uri); else result.put("uploadId", stage.uploadId);
                call.resolve(result);
            } catch (Exception failed) { reject(call, failed); }
        });
    }); }
    @PluginMethod public void stageChunk(PluginCall call) { command(call, service -> {
        PlaybackStore store = service.requireStore(); String uploadId = owned(call); String data = call.getString("data", "");
        if (data.length() > ((PlaybackStore.CHUNK_BYTES + 2) / 3) * 4) throw new IllegalArgumentException("An audio chunk exceeds 256 KiB.");
        copies.execute(() -> {
            try { store.chunk(uploadId, Base64.getDecoder().decode(data)); call.resolve(); }
            catch (Exception failed) { reject(call, failed); }
        });
    }); }
    @PluginMethod public void stageFinish(PluginCall call) { command(call, service -> {
        PlaybackStore store = service.requireStore(); String uploadId = owned(call);
        copies.execute(() -> {
            try { call.resolve(new JSObject().put("uri", store.finish(uploadId))); }
            catch (Exception failed) { reject(call, failed); }
            finally { ownedUploads.remove(uploadId); try { store.abort(uploadId); } catch (IOException ignored) { } }
        });
    }); }
    @PluginMethod public void stageAbort(PluginCall call) { command(call, service -> {
        PlaybackStore store = service.requireStore(); String uploadId = call.getString("uploadId", "");
        if (!ownedUploads.remove(uploadId)) { call.resolve(); return; }
        copies.execute(() -> { try { store.abort(uploadId); call.resolve(); } catch (Exception failed) { reject(call, failed); } });
    }); }
    private String owned(PluginCall call) {
        String id = call.getString("uploadId", "");
        if (!ownedUploads.contains(id)) throw new IllegalArgumentException("This audio copy has expired. Retry copying the track.");
        return id;
    }
}
