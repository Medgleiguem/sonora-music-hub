package app.sonora.music;

import java.io.IOException;
import androidx.media3.common.C;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy;

/** Resolver refusals are terminal; transport failures have a small retry budget. */
final class PlaybackRetryPolicy extends DefaultLoadErrorHandlingPolicy {
    static final class ResolutionFailure extends IOException {
        ResolutionFailure(String message) { super(message); }
    }
    PlaybackRetryPolicy() { super(2); }
    @Override public long getRetryDelayMsFor(LoadErrorHandlingPolicy.LoadErrorInfo info) {
        for (Throwable cause = info.exception; cause != null; cause = cause.getCause())
            if (cause instanceof ResolutionFailure) return C.TIME_UNSET;
        // Media3's configured count is a minimum before surfacing errors. Enforce our cap too.
        if (info.errorCount > 2) return C.TIME_UNSET;
        return super.getRetryDelayMsFor(info);
    }
}
