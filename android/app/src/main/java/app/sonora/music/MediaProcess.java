package app.sonora.music;

import android.system.Os;
import android.system.OsConstants;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** One subprocess session. Cancellation also stops Python's FFmpeg/QuickJS children. */
final class MediaProcess {
    private volatile Process process;
    private volatile int group;
    private volatile String failure;

    synchronized void cancel(String reason) {
        if (failure == null) failure = reason;
        kill();
    }

    boolean isCancelled() { return failure != null; }

    void checkCancelled() throws IOException {
        if (failure != null) throw new IOException(failure);
        if (Thread.currentThread().isInterrupted()) throw new IOException("Media operation interrupted.");
    }

    private synchronized void kill() {
        if (group > 1) {
            try { Os.kill(-group, OsConstants.SIGKILL); } catch (Exception ignored) { }
        }
        if (process != null) process.destroyForcibly();
    }

    String run(ProcessBuilder builder, long timeoutMs, File directory, Consumer<String> onLine) throws Exception {
        checkCancelled();
        ExecutorService readers = Executors.newFixedThreadPool(2);
        ScheduledExecutorService guard = Executors.newSingleThreadScheduledExecutor();
        try {
            process = builder.start();
            // Recheck cancellation that arrived between the first check and start().
            if (failure != null) kill();
            Future<String> stdout = readers.submit(() -> read(process.getInputStream(), 4 * 1024 * 1024, onLine));
            Future<String> stderr = readers.submit(() -> read(process.getErrorStream(), 128 * 1024, line -> {
                if (line.startsWith("SONORA_PID=")) {
                    group = Integer.parseInt(line.substring(11));
                    if (failure != null) kill();
                } else onLine.accept(line);
            }));
            guard.schedule(() -> cancel("The media request timed out. Check your connection and retry."), timeoutMs, TimeUnit.MILLISECONDS);
            if (directory != null) guard.scheduleAtFixedRate(() -> {
                if (size(directory) > 160L * 1024 * 1024) cancel("The source file is too large. Choose a shorter video.");
            }, 500, 500, TimeUnit.MILLISECONDS);
            int status = process.waitFor();
            // A cancelled process can close its pipes before the readers finish.
            // Preserve the actual cancellation/timeout instead of leaking ExecutionException.
            if (failure != null) throw new IOException(failure);
            String output = stdout.get(5, TimeUnit.SECONDS);
            String errors = stderr.get(5, TimeUnit.SECONDS);
            if (failure != null) throw new IOException(failure);
            if (status != 0) throw new Failure(errors);
            // yt-dlp reports filter/max-size skips with exit code zero and no output file.
            String notices = (output + "\n" + errors).toLowerCase(java.util.Locale.ROOT);
            if (notices.contains("does not pass filter") || notices.contains("larger than max-filesize")) throw new Failure(notices);
            return output;
        } finally {
            guard.shutdownNow();
            kill();
            if (process != null) {
                process.getInputStream().close();
                process.getErrorStream().close();
                process.getOutputStream().close();
            }
            readers.shutdownNow();
        }
    }

    private String read(InputStream stream, int max, Consumer<String> onLine) throws IOException {
        StringBuilder result = new StringBuilder();
        StringBuilder line = new StringBuilder();
        try (Reader reader = new InputStreamReader(stream, StandardCharsets.UTF_8)) {
            char[] buffer = new char[4096];
            int count;
            while ((count = reader.read(buffer)) != -1) {
                if (result.length() + count > max) {
                    cancel("The download response is too large. Try another video.");
                    throw new IOException(failure);
                }
                result.append(buffer, 0, count);
                for (int i = 0; i < count; i++) {
                    if (buffer[i] == '\n') { onLine.accept(line.toString()); line.setLength(0); }
                    else line.append(buffer[i]);
                }
            }
            if (line.length() > 0) onLine.accept(line.toString());
        }
        return result.toString();
    }

    static long size(File directory) {
        if (directory.isFile()) return directory.length();
        long total = 0;
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) total += size(file);
        return total;
    }

    static final class Failure extends IOException {
        final String code;
        Failure(String diagnostics) { super(publicError(diagnostics)); code = publicCode(diagnostics); }
    }

    static String publicCode(String message) {
        String value = message == null ? "" : message.toLowerCase(java.util.Locale.ROOT);
        if (value.contains("not a bot") || value.contains("sign in") || value.contains("403") || value.contains("429")) return "YOUTUBE_REFUSED";
        if (value.contains("unavailable") || value.contains("private") || value.contains("age-restricted") || value.contains("removed") || value.contains("not available in your country")) return "VIDEO_UNAVAILABLE";
        if (value.contains("does not pass filter") || value.contains("duration <= 1800") || value.contains("live event will begin")) return "VIDEO_LIMIT";
        if (value.contains("max-filesize") || value.contains("too large")) return "FILE_TOO_LARGE";
        if (value.contains("no space") || value.contains("disk full")) return "STORAGE_FULL";
        if (value.contains("permission denied") || value.contains("read-only file system")) return "STORAGE_PERMISSION";
        if (value.contains("certificate") || value.contains("ssl")) return "TLS_FAILED";
        if (value.contains("requested format") || value.contains("challenge") || value.contains("signature") || value.contains("javascript runtime")) return "ENGINE_OUTDATED";
        if (value.contains("network") || value.contains("resolve") || value.contains("timed out") || value.contains("connection") || value.contains("http error 5")) return "NETWORK_FAILED";
        return "EXTRACTION_FAILED";
    }

    static String publicError(String message) {
        switch (publicCode(message)) {
            case "YOUTUBE_REFUSED": return "YouTube refused this connection. Try Wi-Fi or mobile data, or try again later.";
            case "VIDEO_UNAVAILABLE": return "This video is unavailable. Choose another video.";
            case "VIDEO_LIMIT": return "Downloads require a finished video of 30 minutes or less. Choose a shorter, finished video.";
            case "FILE_TOO_LARGE": return "The source file is too large (maximum 96 MiB). Choose a shorter video.";
            case "STORAGE_FULL": return "Your device is out of space. Free some storage and retry.";
            case "STORAGE_PERMISSION": return "Sonora could not save the file because storage permission was denied. Check device storage and retry.";
            case "TLS_FAILED": return "Could not verify the connection. Check your phone's date and time, then retry.";
            case "ENGINE_OUTDATED": return "YouTube changed its media format. Install the latest Sonora update and retry.";
            case "NETWORK_FAILED": return "Could not connect. Check your internet connection and retry.";
            default: return "Could not read this video's audio. Try another video or update Sonora.";
        }
    }
}
