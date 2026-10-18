package app.sonora.music;

import java.io.IOException;
import java.net.SocketTimeoutException;
import androidx.media3.common.C;
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy;
import org.junit.Test;
import static org.junit.Assert.*;

public class PlaybackRetryPolicyTest {
    @Test public void transientNetworkErrorsHaveExactlyTwoRetries() {
        PlaybackRetryPolicy policy = new PlaybackRetryPolicy();
        assertEquals(2, policy.getMinimumLoadableRetryCount(C.DATA_TYPE_MEDIA));
        assertTrue(policy.getRetryDelayMsFor(error(new SocketTimeoutException("Read timed out"), 1)) >= 0);
        assertTrue(policy.getRetryDelayMsFor(error(new IOException("Connection reset"), 2)) >= 0);
        assertEquals(C.TIME_UNSET, policy.getRetryDelayMsFor(error(new IOException("Connection reset"), 3)));
    }
    @Test public void nestedResolverRefusalsAreNeverRetried() {
        PlaybackRetryPolicy policy = new PlaybackRetryPolicy();
        IOException refusal = new IOException("Loader failed", new IOException("Wrapped", new PlaybackRetryPolicy.ResolutionFailure("YouTube refused this connection.")));
        assertEquals(C.TIME_UNSET, policy.getRetryDelayMsFor(error(refusal, 1)));
        assertEquals(C.TIME_UNSET, policy.getRetryDelayMsFor(error(new PlaybackRetryPolicy.ResolutionFailure("Resolution deadline exceeded."), 1)));
    }
    private static LoadErrorHandlingPolicy.LoadErrorInfo error(IOException exception, int failures) {
        return new LoadErrorHandlingPolicy.LoadErrorInfo(null, null, exception, failures);
    }
}
