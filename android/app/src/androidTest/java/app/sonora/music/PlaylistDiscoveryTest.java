package app.sonora.music;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PlaylistDiscoveryTest {
    @Test public void mixLookupOpensItsSeedAndRetainsSourceValidation() {
        assertEquals("https://www.youtube.com/watch?v=uSiHqxgE2d0&list=RDuSiHqxgE2d0",
            NativeMedia.playlistExtractionSource("https://youtube.com/playlist?list=RDuSiHqxgE2d0&playnext=1&si=tracking"));
        assertEquals("https://www.youtube.com/playlist?list=PL123456789012",
            NativeMedia.playlistExtractionSource("https://youtube.com/watch?v=uSiHqxgE2d0&list=PL123456789012"));
        assertThrows(IllegalArgumentException.class, () -> NativeMedia.playlistExtractionSource("https://evil.example/playlist?list=RDuSiHqxgE2d0"));
    }
    @Test public void mixSnapshotsStopAt100WithoutTruncatingSavedPlaylists() throws Exception {
        JSONObject data = new JSONObject().put("entries", new JSONArray()
            .put(new JSONObject().put("id", "uSiHqxgE2d0"))
            .put(new JSONObject().put("id", "VHoT4N43jK8"))
            .put(new JSONObject().put("id", "K5KAc5CoCuk")));
        String mix = "https://www.youtube.com/playlist?list=RDuSiHqxgE2d0";
        JSONObject first = NativeMedia.lookupResult(data, true, "video", 1, 2, mix);
        assertEquals(3, first.getInt("nextStart"));
        JSONObject last = NativeMedia.lookupResult(data, true, "video", 99, 2, mix);
        assertTrue(last.isNull("nextStart"));
        assertEquals(2, last.getJSONArray("entries").length());
        assertEquals(100, last.getJSONArray("entries").getJSONObject(1).getInt("playlistIndex"));
        assertTrue(last.getBoolean("limited"));
        JSONObject beyond = NativeMedia.lookupResult(data, true, "video", 101, 2, mix);
        assertEquals(0, beyond.getJSONArray("entries").length());
        assertTrue(beyond.isNull("nextStart"));
        JSONObject saved = NativeMedia.lookupResult(data, true, "video", 99, 2, "https://www.youtube.com/playlist?list=PL123456789012");
        assertEquals(101, saved.getInt("nextStart"));
        assertFalse(saved.getBoolean("limited"));
    }
    @Test public void batchesKeepUnavailableSourcePositionsAndLookahead() throws Exception {
        JSONObject data = new JSONObject().put("entries", new JSONArray().put(JSONObject.NULL)
            .put(new JSONObject().put("id", "removed")).put(new JSONObject().put("id", "jNQXAC9IVRw")));
        JSONObject result = NativeMedia.lookupResult(data, true, "video", 101, 2, "https://www.youtube.com/playlist?list=PL123456789012");
        assertEquals(0, result.getJSONArray("entries").length());
        assertEquals(103, result.getInt("nextStart"));
        assertTrue(result.isNull("total"));
    }

    @Test public void artistsAndPlaylistsKeepTheirCollectionIdentity() throws Exception {
        JSONObject data = new JSONObject().put("entries", new JSONArray().put(new JSONObject().put("id", "UCabcdefghijklmnopqrstuv").put("title", "Artist")));
        JSONObject artist = NativeMedia.lookupResult(data, false, "artist", 1, 24, "").getJSONArray("results").getJSONObject(0);
        assertEquals("artist", artist.getString("kind"));
        assertEquals("https://www.youtube.com/playlist?list=UUabcdefghijklmnopqrstuv", artist.getString("uploadsUrl"));
        data.put("entries", new JSONArray().put(new JSONObject().put("id", "PL123456789012").put("title", "Collection")));
        JSONObject playlist = NativeMedia.lookupResult(data, false, "playlist", 1, 24, "").getJSONArray("results").getJSONObject(0);
        assertEquals("playlist", playlist.getString("kind"));
        assertEquals("https://www.youtube.com/playlist?list=PL123456789012", playlist.getString("shareUrl"));
    }

    @Test public void lookupRequestsValidateAndSeparateCacheIdentity() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> NativeMedia.lookupRequest("music", false, "arbitrary", 1));
        assertThrows(IllegalArgumentException.class, () -> NativeMedia.lookupRequest("music", false, "video", 0));
        String url = "https://www.youtube.com/playlist?list=PL123456789012";
        assertNotEquals(NativeMedia.lookupRequest(url, true, "video", 1).toString(), NativeMedia.lookupRequest(url, true, "video", 101).toString());
        assertNotEquals(NativeMedia.lookupRequest("Artist", false, "video", 1).toString(), NativeMedia.lookupRequest("Artist", false, "artist", 1).toString());
    }
}
