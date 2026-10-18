package app.sonora.music;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.*;
import androidx.annotation.Nullable;
import androidx.media3.common.*;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.*;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import app.sonora.music.PlaybackRetryPolicy.ResolutionFailure;
import androidx.media3.session.*;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

/** The queue and media loaders live here, independently of the Activity and WebView. */
@UnstableApi
public class PlaybackService extends MediaSessionService {
    static final String LOCAL_BIND = "app.sonora.music.PLAYBACK_LOCAL";
    final class LocalBinder extends Binder { PlaybackService service() { return PlaybackService.this; } }
    interface Observer { void state(JSONObject state); }
    private final LocalBinder binder = new LocalBinder();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<Observer> observers = new HashSet<>();
    private final ConcurrentHashMap<String, Entry> entries = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<MediaProcess, Resolution> resolving = new ConcurrentHashMap<>();
    private ExoPlayer player;
    private MediaSession session;
    private NativeMedia media;
    PlaybackStore store;
    private String error = "";
    private String requestId = "";
    private float volume = 1;
    private boolean muted;
    private final Runnable tick = new Runnable() {
        @Override public void run() { emit(); main.postDelayed(this, 1000); }
    };
    private static final class Entry {
        final JSONObject metadata;
        final String token, uri, youtube;
        Entry(JSONObject metadata, String token, String uri, String youtube) {
            this.metadata = metadata; this.token = token; this.uri = uri; this.youtube = youtube;
        }
    }
    private static final class Resolution {
        final Entry entry;
        volatile boolean canceled;
        Resolution(Entry entry) { this.entry = entry; }
    }

    @Override public void onCreate() {
        super.onCreate();
        try { store = new PlaybackStore(new File(getFilesDir(), "sonora-playback")); }
        catch (IOException failed) { error = "Private audio storage is unavailable."; }
        media = new NativeMedia(this);
        ProgressiveMediaSource.Factory sourceFactory = new ProgressiveMediaSource.Factory(() -> new QueueDataSource())
            // Upstream bot checks/refusals must surface once, without endless extractor retries.
            .setLoadErrorHandlingPolicy(new PlaybackRetryPolicy());
        player = new ExoPlayer.Builder(this).setMediaSourceFactory(sourceFactory).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.addListener(new Player.Listener() {
            @Override public void onEvents(Player player, Player.Events events) { emit(); }
            @Override public void onMediaItemTransition(@Nullable MediaItem item, int reason) { error = ""; emit(); }
            @Override public void onPositionDiscontinuity(Player.PositionInfo oldPosition, Player.PositionInfo newPosition, int reason) {
                if (oldPosition.mediaItemIndex != newPosition.mediaItemIndex) cancelExceptCurrent();
            }
            @Override public void onPlayerError(PlaybackException failure) {
                // Do not expose exception messages: a data-source message can contain signed URLs.
                String safe = "Could not play this audio. Check your connection and retry.";
                for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                    if (cause instanceof ResolutionFailure) { safe = cause.getMessage(); break; }
                }
                error = safe;
                player.pause();
                emit();
            }
        });
        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent activity = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, player).setSessionActivity(activity).setCallback(new MediaSession.Callback() {
            @Override public MediaSession.ConnectionResult onConnect(MediaSession session, MediaSession.ControllerInfo controller) {
                // No set/add/replace media items, URI playback, custom commands, or playlist writes.
                Player.Commands safe = new Player.Commands.Builder().addAll(
                    Player.COMMAND_PLAY_PAUSE, Player.COMMAND_PREPARE, Player.COMMAND_STOP,
                    Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM, Player.COMMAND_SEEK_TO_DEFAULT_POSITION,
                    Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                    Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
                    Player.COMMAND_SEEK_BACK, Player.COMMAND_SEEK_FORWARD,
                    Player.COMMAND_GET_CURRENT_MEDIA_ITEM, Player.COMMAND_GET_TIMELINE,
                    Player.COMMAND_GET_METADATA, Player.COMMAND_GET_AUDIO_ATTRIBUTES,
                    Player.COMMAND_GET_VOLUME).build();
                return new MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                    .setAvailableSessionCommands(new SessionCommands.Builder().build())
                    .setAvailablePlayerCommands(safe).build();
            }
        }).build();
        // The app binds locally, so registration cannot depend on an external onGetSession call.
        addSession(session);
        main.post(tick);
    }
    @Override public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) { return session; }
    @Override public IBinder onBind(Intent intent) {
        if (LOCAL_BIND.equals(intent.getAction())) {
            // An explicit external bind cannot acquire the in-process command surface.
            if (Binder.getCallingUid() != android.os.Process.myUid()) return null;
            return binder;
        }
        return super.onBind(intent);
    }
    @Override public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        cancelAll();
        observers.clear();
        if (store != null) store.close();
        if (session != null) session.release();
        if (player != null) player.release();
        super.onDestroy();
    }
    void observe(Observer observer) { observers.add(observer); observer.state(snapshot()); }
    void unobserve(Observer observer) { observers.remove(observer); }
    private void emit() {
        if (player == null || observers.isEmpty()) return;
        JSONObject state = snapshot();
        for (Observer observer : new ArrayList<>(observers)) observer.state(state);
    }
    JSONObject snapshot() {
        JSONObject state = new JSONObject();
        try {
            JSONArray items = new JSONArray();
            for (int i = 0; i < player.getMediaItemCount(); i++) {
                Entry entry = entry(player.getMediaItemAt(i));
                if (entry != null) items.put(new JSONObject(entry.metadata.toString()));
            }
            int index = items.length() == 0 ? -1 : player.getCurrentMediaItemIndex();
            state.put("currentId", index < 0 ? JSONObject.NULL : player.getCurrentMediaItem().mediaId)
                .put("index", index).put("playing", index >= 0 && player.getPlayWhenReady() && player.getPlaybackState() != Player.STATE_IDLE && player.getPlaybackState() != Player.STATE_ENDED && error.isEmpty())
                .put("buffering", player.getPlaybackState() == Player.STATE_BUFFERING)
                .put("position", Math.max(0, player.getCurrentPosition()) / 1000.0)
                .put("duration", player.getDuration() == C.TIME_UNSET ? 0 : Math.max(0, player.getDuration()) / 1000.0)
                .put("error", error.isEmpty() ? JSONObject.NULL : error).put("items", items)
                .put("repeat", player.getRepeatMode() == Player.REPEAT_MODE_ONE ? "one" : player.getRepeatMode() == Player.REPEAT_MODE_ALL ? "all" : "off")
                .put("shuffle", player.getShuffleModeEnabled()).put("volume", volume).put("muted", muted);
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        return state;
    }
    void setQueue(JSONArray items, int index, double position) throws Exception { setQueue(items, index, position, ""); }
    void setQueue(JSONArray items, int index, double position, String requestId) throws Exception {
        if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{0,128}")) throw new IllegalArgumentException("Invalid queue request identifier.");
        if (items == null || items.length() > 500) throw new IllegalArgumentException("The playback queue supports up to 500 tracks.");
        if (items.length() > 0 && (index < 0 || index >= items.length())) throw new IllegalArgumentException("Invalid queue position.");
        long start = PlaybackPolicy.millis(position);
        List<MediaItem> queue = new ArrayList<>();
        Map<String, Entry> incoming = new HashMap<>();
        Set<String> ids = new HashSet<>();
        for (int i = 0; i < items.length(); i++) {
            Entry entry = parse(items.getJSONObject(i));
            if (!ids.add(entry.metadata.getString("id"))) throw new IllegalArgumentException("A track occurs more than once in the queue.");
            incoming.put(entry.token, entry);
            queue.add(mediaItem(entry));
        }
        cancelAll();
        this.requestId = requestId;
        entries.clear(); entries.putAll(incoming);
        error = "";
        if (queue.isEmpty()) { player.clearMediaItems(); player.stop(); }
        else { player.setMediaItems(queue, index, start); player.prepare(); player.play(); }
        emit();
    }
    void play() { error = ""; if (player.getPlaybackState() == Player.STATE_IDLE || player.getPlaybackState() == Player.STATE_ENDED) player.prepare(); player.play(); emit(); }
    void pause() { player.pause(); emit(); }
    void next() { error = ""; player.seekToNextMediaItem(); cancelExceptCurrent(); if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare(); emit(); }
    void previous() { error = ""; player.seekToPrevious(); cancelExceptCurrent(); if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare(); emit(); }
    void seek(double position) { player.seekTo(PlaybackPolicy.millis(position)); emit(); }
    void select(String id) {
        for (int i = 0; i < player.getMediaItemCount(); i++) if (player.getMediaItemAt(i).mediaId.equals(id)) {
            error = ""; player.seekTo(i, 0); cancelExceptCurrent(); player.prepare(); player.play(); emit(); return;
        }
        throw new IllegalArgumentException("This track is no longer in the queue.");
    }
    void add(JSONObject item, boolean next) throws Exception {
        if (player.getMediaItemCount() >= 500) throw new IllegalArgumentException("The playback queue supports up to 500 tracks.");
        Entry incoming = parse(item);
        for (int i = 0; i < player.getMediaItemCount(); i++) if (player.getMediaItemAt(i).mediaId.equals(incoming.metadata.getString("id"))) return;
        entries.put(incoming.token, incoming);
        int index = next && player.getMediaItemCount() > 0 ? player.getCurrentMediaItemIndex() + 1 : player.getMediaItemCount();
        player.addMediaItem(index, mediaItem(incoming)); emit();
    }
    void insert(JSONObject item, int index, String requestId) throws Exception {
        if (!this.requestId.equals(requestId)) throw new IOException("The playback queue changed. This prepared item was discarded.");
        if (index < 0 || index > player.getMediaItemCount()) throw new IllegalArgumentException("Invalid queue insertion position.");
        Entry incoming = parse(item);
        for (int i = 0; i < player.getMediaItemCount(); i++) if (player.getMediaItemAt(i).mediaId.equals(incoming.metadata.getString("id"))) return;
        if (player.getMediaItemCount() >= 500) throw new IllegalArgumentException("The playback queue supports up to 500 tracks.");
        entries.put(incoming.token, incoming);
        player.addMediaItem(index, mediaItem(incoming)); emit();
    }
    void clearUpcoming() {
        int current = player.getCurrentMediaItemIndex();
        if (player.getMediaItemCount() > 0) {
            player.removeMediaItems(current + 1, player.getMediaItemCount());
            player.removeMediaItems(0, current);
        }
        prune(); emit();
    }
    void remove(String id) {
        for (int i = player.getMediaItemCount() - 1; i >= 0; i--) if (player.getMediaItemAt(i).mediaId.equals(id)) {
            if (i == player.getCurrentMediaItemIndex()) player.pause();
            player.removeMediaItem(i);
        }
        prune(); emit();
    }
    void removeMedia(String id) throws IOException {
        if (player.getCurrentMediaItem() != null && id.equals(player.getCurrentMediaItem().mediaId) && player.getPlayWhenReady())
            throw new IOException("Pause this track before removing its private audio copy.");
        requireStore().remove(id);
    }
    PlaybackStore requireStore() throws IOException { if (store == null) throw new IOException("Private audio storage is unavailable."); return store; }
    void options(JSONObject options) throws JSONException {
        if (options.has("repeat")) {
            String repeat = options.getString("repeat");
            if (!Arrays.asList("off", "one", "all").contains(repeat)) throw new IllegalArgumentException("Invalid repeat option.");
            player.setRepeatMode(repeat.equals("one") ? Player.REPEAT_MODE_ONE : repeat.equals("all") ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF);
        }
        if (options.has("shuffle")) player.setShuffleModeEnabled(options.getBoolean("shuffle"));
        if (options.has("volume")) {
            double value = options.getDouble("volume");
            if (!Double.isFinite(value) || value < 0 || value > 1) throw new IllegalArgumentException("Volume must be between zero and one.");
            volume = (float)value;
        }
        if (options.has("muted")) muted = options.getBoolean("muted");
        player.setVolume(muted ? 0 : volume); emit();
    }
    private Entry parse(JSONObject input) throws Exception {
        String id = input.getString("id"); PlaybackStore.validateId(id);
        JSONObject metadata = new JSONObject();
        for (String key : Arrays.asList("id", "title", "artist", "album", "cover", "source", "externalId", "uri")) {
            String value = input.optString(key, "");
            if (value.length() > (key.equals("uri") ? 8192 : 4096)) throw new IllegalArgumentException("Track metadata is too long.");
            metadata.put(key, value);
        }
        String source = metadata.getString("source"), uri = metadata.getString("uri"), youtube = "";
        if (uri.startsWith("file:")) uri = requireStore().privateFile(uri).toURI().toString();
        else if (source.equals("youtube")) { youtube = PlaybackPolicy.youtube(metadata.getString("externalId")); uri = ""; metadata.put("uri", ""); }
        else if (source.equals("jamendo") && PlaybackPolicy.jamendo(uri)) { /* Validated stream. */ }
        else throw new IllegalArgumentException("This track needs a private offline audio copy or a supported HTTPS stream.");
        return new Entry(metadata, "sonora-item:///" + UUID.randomUUID(), uri, youtube);
    }
    private MediaItem mediaItem(Entry entry) throws JSONException {
        return new MediaItem.Builder().setMediaId(entry.metadata.getString("id")).setUri(entry.token)
            .setMediaMetadata(new MediaMetadata.Builder().setTitle(entry.metadata.optString("title"))
                .setArtist(entry.metadata.optString("artist")).setAlbumTitle(entry.metadata.optString("album")).build()).build();
    }
    private Entry entry(MediaItem item) { return item == null || item.localConfiguration == null ? null : entries.get(item.localConfiguration.uri.toString()); }
    private void prune() {
        Set<String> retained = new HashSet<>();
        for (int i = 0; i < player.getMediaItemCount(); i++) retained.add(player.getMediaItemAt(i).localConfiguration.uri.toString());
        entries.keySet().retainAll(retained);
        for (Map.Entry<MediaProcess, Resolution> job : resolving.entrySet()) if (!entries.containsKey(job.getValue().entry.token)) cancel(job);
    }
    private void cancelExceptCurrent() {
        Entry current = entry(player.getCurrentMediaItem());
        for (Map.Entry<MediaProcess, Resolution> job : resolving.entrySet()) if (job.getValue().entry != current) cancel(job);
    }
    private void cancelAll() { for (Map.Entry<MediaProcess, Resolution> job : resolving.entrySet()) cancel(job); }
    private void cancel(Map.Entry<MediaProcess, Resolution> job) { job.getValue().canceled = true; job.getKey().cancel("Playback changed."); }

    /** ExoPlayer calls open() on its loader thread, never on the main or WebView thread. */
    private final class QueueDataSource implements DataSource {
        private final List<TransferListener> listeners = new ArrayList<>();
        private DataSource delegate;
        @Override public void addTransferListener(TransferListener listener) { listeners.add(listener); if (delegate != null) delegate.addTransferListener(listener); }
        @Override public long open(DataSpec spec) throws IOException {
            Entry entry = entries.get(spec.uri.toString());
            if (entry == null) throw new IOException("This queue item has expired.");
            String url = entry.uri;
            Map<String, String> headers = new HashMap<>();
            if (!entry.youtube.isEmpty()) {
                MediaProcess process = new MediaProcess();
                Resolution resolution = new Resolution(entry);
                resolving.put(process, resolution);
                try {
                    // Resolution only lasts for this open; expiring signed URLs never enter queue state.
                    JSONObject result = media.resolve(entry.youtube, process);
                    if (resolution.canceled || entries.get(entry.token) != entry) throw new IOException("Playback changed.");
                    url = result.getString("url");
                    JSONObject raw = result.optJSONObject("headers");
                    if (raw != null) for (Iterator<String> keys = raw.keys(); keys.hasNext();) { String key = keys.next(); headers.put(key, raw.getString(key)); }
                } catch (Exception failed) {
                    if (resolution.canceled) throw new IOException("Playback changed.");
                    String message = failed instanceof IOException ? failed.getMessage() : "Could not resolve this YouTube audio. Retry later.";
                    // NativeMedia's public failures are sanitized; additionally reject URL-bearing text.
                    if (message == null || message.contains("://") || message.length() > 300) message = "Could not resolve this YouTube audio. Retry later.";
                    throw new ResolutionFailure(message);
                } finally { resolving.remove(process); }
            }
            if (entries.get(entry.token) != entry) throw new IOException("Playback changed.");
            if (url.startsWith("file:")) {
                requireStore().privateFile(url);
                delegate = new FileDataSource();
            } else delegate = new DefaultHttpDataSource.Factory().setConnectTimeoutMs(15000).setReadTimeoutMs(20000)
                .setAllowCrossProtocolRedirects(false).setDefaultRequestProperties(headers).createDataSource();
            for (TransferListener listener : listeners) delegate.addTransferListener(listener);
            return delegate.open(spec.buildUpon().setUri(Uri.parse(url)).build());
        }
        @Override public int read(byte[] buffer, int offset, int length) throws IOException { if (delegate == null) throw new IOException("Audio is not open."); return delegate.read(buffer, offset, length); }
        @Override public Uri getUri() { return delegate == null ? null : delegate.getUri(); }
        @Override public Map<String,List<String>> getResponseHeaders() { return delegate == null ? Collections.emptyMap() : delegate.getResponseHeaders(); }
        @Override public void close() throws IOException { if (delegate != null) { delegate.close(); delegate = null; } }
    }
}
