package app.sonora.music;

import android.content.*;
import android.os.IBinder;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.media3.common.Player;
import androidx.media3.session.*;
import org.json.*;
import org.junit.*;
import java.io.*;
import java.nio.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Uses real local PCM audio; independent of network access and YouTube availability. */
public class PlaybackServiceTest {
    private Context context;
    private PlaybackService service;
    private ServiceConnection connection;
    @Before public void bind() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        CountDownLatch connected = new CountDownLatch(1);
        connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) { service = ((PlaybackService.LocalBinder)binder).service(); connected.countDown(); }
            @Override public void onServiceDisconnected(ComponentName name) { }
        };
        context.bindService(new Intent(context, PlaybackService.class).setAction(PlaybackService.LOCAL_BIND), connection, Context.BIND_AUTO_CREATE);
        assertTrue("Service did not bind", connected.await(10, TimeUnit.SECONDS));
        onMain(() -> { service.setQueue(new JSONArray(), 0, 0); service.options(new JSONObject().put("repeat", "off").put("shuffle", false)); });
    }
    @After public void unbind() throws Exception {
        if (service != null) onMain(() -> service.setQueue(new JSONArray(), 0, 0));
        if (connection != null) context.unbindService(connection);
    }
    @Test public void localQueueAdvancesWithoutAnyJavascriptOrActivity() throws Exception {
        JSONArray queue = new JSONArray().put(track("player-test-first", 1)).put(track("player-test-second", 4));
        onMain(() -> service.setQueue(queue, 0, 0));
        await(() -> "player-test-second".equals(state().optString("currentId")), 10000);
        assertEquals("Local binding must register the session for notifications", 1, service.getSessions().size());
        await(this::foreground, 5000);
        JSONObject state = state();
        assertEquals(1, state.getInt("index"));
        assertNull(state.opt("error") == JSONObject.NULL ? null : state.opt("error"));
        assertTrue(state.getBoolean("playing"));
        assertEquals(2, state.getJSONArray("items").length());
    }
    @Test public void queueMutationAndStateRecoveryKeepCurrentPlayback() throws Exception {
        JSONArray queue = new JSONArray().put(track("player-test-first", 6)).put(track("player-test-second", 4));
        onMain(() -> service.setQueue(queue, 0, 0));
        await(() -> state().optDouble("position") > .2, 8000);
        onMain(() -> { service.pause(); service.seek(1.25); service.options(new JSONObject().put("repeat", "all").put("shuffle", true).put("volume", .4).put("muted", true)); });
        JSONObject before = state();
        AtomicReference<JSONObject> reattached = new AtomicReference<>();
        onMain(() -> { PlaybackService.Observer observer = reattached::set; service.observe(observer); service.unobserve(observer); service.clearUpcoming(); });
        assertEquals(before.getString("currentId"), reattached.get().getString("currentId"));
        assertEquals(1.25, reattached.get().getDouble("position"), .1);
        assertEquals("all", reattached.get().getString("repeat"));
        assertTrue(reattached.get().getBoolean("muted"));
        assertEquals(1, state().getJSONArray("items").length());
        assertFalse(state().getBoolean("playing"));
    }
    @Test public void controllersReceiveTransportButCannotMutateQueueOrPlayUris() throws Exception {
        MediaController controller = new MediaController.Builder(context, new SessionToken(context, new ComponentName(context, PlaybackService.class))).buildAsync().get(10, TimeUnit.SECONDS);
        try {
            AtomicReference<Player.Commands> commands = new AtomicReference<>();
            onMain(() -> commands.set(controller.getAvailableCommands()));
            assertTrue(commands.get().contains(Player.COMMAND_PLAY_PAUSE));
            assertFalse(commands.get().contains(Player.COMMAND_CHANGE_MEDIA_ITEMS));
            assertFalse(commands.get().contains(Player.COMMAND_SET_MEDIA_ITEM));
        } finally { onMain(controller::release); }
    }
    @Test public void rapidQueueReplacementCannotPlayAnEarlierSelection() throws Exception {
        JSONObject first = track("player-test-first", 4), second = track("player-test-second", 4);
        onMain(() -> {
            for (int i = 0; i < 5; i++) service.setQueue(new JSONArray().put(first), 0, 0);
            service.setQueue(new JSONArray().put(second), 0, 0);
        });
        await(() -> state().optDouble("position") > .2, 8000);
        assertEquals("player-test-second", state().getString("currentId"));
        assertEquals(1, state().getJSONArray("items").length());
    }
    @Test public void insertionPreservesPositionAndRejectsStalePreparation() throws Exception {
        JSONObject first = track("player-test-first", 6), second = track("player-test-second", 4);
        onMain(() -> service.setQueue(new JSONArray().put(first), 0, 0, "generation-1"));
        await(() -> state().optDouble("position") > .2, 8000);
        onMain(() -> { service.pause(); service.seek(1.25); service.insert(second, 0, "generation-1"); });
        assertEquals("player-test-first", state().getString("currentId"));
        assertEquals(1, state().getInt("index"));
        assertEquals(1.25, state().getDouble("position"), .1);
        onMain(() -> service.setQueue(new JSONArray().put(first), 0, 0, "generation-2"));
        try { onMain(() -> service.insert(second, 1, "generation-1")); fail("Stale queue preparation was accepted"); }
        catch (IOException expected) { }
        assertEquals(1, state().getJSONArray("items").length());
    }
    private boolean foreground() {
        android.app.ActivityManager manager = (android.app.ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE);
        for (android.app.ActivityManager.RunningServiceInfo info : manager.getRunningServices(50))
            if (info.service.getClassName().equals(PlaybackService.class.getName())) return info.foreground;
        return false;
    }
    private JSONObject track(String id, int seconds) throws Exception {
        byte[] wav = wav(seconds);
        PlaybackStore.Stage stage = service.requireStore().start(id, wav.length);
        String uri = stage.uri;
        if (uri == null) {
            for (int offset = 0; offset < wav.length; offset += PlaybackStore.CHUNK_BYTES)
                service.store.chunk(stage.uploadId, java.util.Arrays.copyOfRange(wav, offset, Math.min(wav.length, offset + PlaybackStore.CHUNK_BYTES)));
            uri = service.store.finish(stage.uploadId);
        }
        return new JSONObject().put("id", id).put("source", "local").put("title", id).put("uri", uri);
    }
    private static byte[] wav(int seconds) {
        int size = seconds * 8000 * 2;
        ByteBuffer bytes = ByteBuffer.allocate(44 + size).order(ByteOrder.LITTLE_ENDIAN);
        bytes.put(new byte[]{'R','I','F','F'}).putInt(36 + size).put(new byte[]{'W','A','V','E','f','m','t',' '})
            .putInt(16).putShort((short)1).putShort((short)1).putInt(8000).putInt(16000).putShort((short)2).putShort((short)16)
            .put(new byte[]{'d','a','t','a'}).putInt(size);
        for (int i = 0; i < size / 2; i++) bytes.putShort((short)(Math.sin(i * 2 * Math.PI * 440 / 8000) * 100));
        return bytes.array();
    }
    private JSONObject state() throws Exception { AtomicReference<JSONObject> state = new AtomicReference<>(); onMain(() -> state.set(service.snapshot())); return state.get(); }
    private interface Action { void run() throws Exception; }
    private interface Condition { boolean met() throws Exception; }
    private static void onMain(Action action) throws Exception {
        AtomicReference<Exception> failed = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> { try { action.run(); } catch (Exception error) { failed.set(error); } });
        if (failed.get() != null) throw failed.get();
    }
    private static void await(Condition condition, long timeout) throws Exception {
        long deadline = System.currentTimeMillis() + timeout;
        while (System.currentTimeMillis() < deadline) { if (condition.met()) return; Thread.sleep(50); }
        fail("Timed out waiting for native playback");
    }
}
