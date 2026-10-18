package app.sonora.music;

import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import java.io.*;
import java.nio.file.Files;
import static org.junit.Assert.*;

public class PlaybackStoreTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    @Test public void incompleteReplacementLeavesPreviouslyPlayableAudioIntact() throws Exception {
        PlaybackStore store = new PlaybackStore(temporary.newFolder());
        PlaybackStore.Stage first = store.start("track-1", 3);
        store.chunk(first.uploadId, new byte[]{1,2,3});
        String uri = store.finish(first.uploadId);
        PlaybackStore.Stage replacement = store.start("track-1", 4);
        store.chunk(replacement.uploadId, new byte[]{9});
        try { store.finish(replacement.uploadId); fail("Incomplete upload accepted"); }
        catch (IOException expected) { }
        assertArrayEquals(new byte[]{1,2,3}, Files.readAllBytes(new File(java.net.URI.create(uri)).toPath()));
    }
    @Test public void completeUploadIsReusableAndAtomicallyReplaced() throws Exception {
        PlaybackStore store = new PlaybackStore(temporary.newFolder());
        PlaybackStore.Stage stage = store.start("track-1", 2);
        store.chunk(stage.uploadId, new byte[]{1,2});
        String uri = store.finish(stage.uploadId);
        assertEquals(uri, store.start("track-1", 2).uri);
        PlaybackStore.Stage replacement = store.start("track-1", 3);
        store.chunk(replacement.uploadId, new byte[]{4,5,6});
        assertEquals(uri, store.finish(replacement.uploadId));
        assertArrayEquals(new byte[]{4,5,6}, Files.readAllBytes(new File(java.net.URI.create(uri)).toPath()));
    }
    @Test public void rejectsTraversalOversizeAndUnexpectedBytes() throws Exception {
        PlaybackStore store = new PlaybackStore(temporary.newFolder());
        reject(() -> store.start("../secret", 4));
        reject(() -> store.start("track", 256L * 1024 * 1024 + 1));
        reject(() -> store.start("track", 0));
        PlaybackStore.Stage stage = store.start("track", 1);
        reject(() -> store.chunk(stage.uploadId, new byte[256 * 1024 + 1]));
        reject(() -> store.chunk(stage.uploadId, new byte[]{1,2}));
    }
    @Test public void partialFilesNeverPassPrivateUriValidationAndAbortDeletesThem() throws Exception {
        File root = temporary.newFolder();
        PlaybackStore store = new PlaybackStore(root);
        PlaybackStore.Stage stage = store.start("track", 2);
        store.chunk(stage.uploadId, new byte[]{1});
        for (File file : root.listFiles()) reject(() -> store.privateFile(file.toURI().toString()));
        store.abort(stage.uploadId);
        reject(() -> store.finish(stage.uploadId));
        assertEquals(0, root.listFiles().length);
        File outside = temporary.newFile();
        reject(() -> store.privateFile(outside.toURI().toString()));
    }
    @Test public void rejectsSimultaneousReplacementOfSameTrack() throws Exception {
        PlaybackStore store = new PlaybackStore(temporary.newFolder());
        store.start("track", 2);
        reject(() -> store.start("track", 3));
    }
    @Test public void removeDeletesOnlyRequestedCompletedCopy() throws Exception {
        PlaybackStore store = new PlaybackStore(temporary.newFolder());
        PlaybackStore.Stage stage = store.start("track", 1);
        store.chunk(stage.uploadId, new byte[]{1});
        String uri = store.finish(stage.uploadId);
        store.remove("track");
        assertFalse(new File(java.net.URI.create(uri)).exists());
        reject(() -> store.remove("../outside"));
    }
    private interface Action { void run() throws Exception; }
    private static void reject(Action action) throws Exception {
        try { action.run(); fail("Unsafe operation accepted"); }
        catch (IOException | IllegalArgumentException expected) { }
    }
}
