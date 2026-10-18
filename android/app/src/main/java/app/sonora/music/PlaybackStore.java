package app.sonora.music;

import java.io.*;
import java.net.URI;
import java.nio.file.*;
import java.util.*;

/** Private, bounded blob staging. A completed name is published only by atomic rename. */
final class PlaybackStore {
    static final long MAX_BYTES = 256L * 1024 * 1024;
    static final int CHUNK_BYTES = 256 * 1024;
    private final File root;
    private final Map<String, Upload> uploads = new HashMap<>();
    static final class Stage {
        final String uploadId, uri;
        Stage(String uploadId, String uri) { this.uploadId = uploadId; this.uri = uri; }
    }
    private static final class Upload {
        final String id;
        final long size;
        final File file;
        final FileOutputStream stream;
        long written;
        Upload(String id, long size, File file) throws IOException {
            this.id = id; this.size = size; this.file = file;
            stream = new FileOutputStream(file);
        }
    }
    PlaybackStore(File directory) throws IOException {
        root = directory.getCanonicalFile();
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Could not create private audio storage.");
        // Process death cannot leave a partially copied track playable.
        File[] files = root.listFiles((dir, name) -> name.endsWith(".part"));
        if (files != null) for (File file : files) Files.deleteIfExists(file.toPath());
    }
    static void validateId(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,128}")) throw new IllegalArgumentException("Invalid track identifier.");
    }
    synchronized Stage start(String id, long size) throws IOException {
        validateId(id);
        if (size < 1 || size > MAX_BYTES) throw new IllegalArgumentException("Native offline playback supports audio files up to 256 MiB.");
        if (uploads.values().stream().anyMatch(upload -> upload.id.equals(id))) throw new IOException("This track is already being copied.");
        File target = target(id);
        if (target.isFile() && target.length() == size) return new Stage(null, target.toURI().toString());
        if (uploads.size() >= 2) throw new IOException("Audio copying is busy. Retry in a moment.");
        String uploadId = UUID.randomUUID().toString();
        uploads.put(uploadId, new Upload(id, size, new File(root, uploadId + ".part")));
        return new Stage(uploadId, null);
    }
    synchronized void chunk(String uploadId, byte[] data) throws IOException {
        Upload upload = upload(uploadId);
        if (data == null || data.length == 0 || data.length > CHUNK_BYTES || upload.written + data.length > upload.size)
            throw new IllegalArgumentException("Invalid audio chunk size.");
        upload.stream.write(data);
        upload.written += data.length;
    }
    synchronized String finish(String uploadId) throws IOException {
        Upload upload = upload(uploadId);
        if (upload.written != upload.size) { abort(uploadId); throw new IOException("The audio copy is incomplete. The original audio is kept."); }
        try {
            upload.stream.getFD().sync();
            upload.stream.close();
            File target = target(upload.id);
            Files.move(upload.file.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            return target.toURI().toString();
        } finally { uploads.remove(uploadId); upload.stream.close(); Files.deleteIfExists(upload.file.toPath()); }
    }
    synchronized void abort(String uploadId) throws IOException {
        Upload upload = uploads.remove(uploadId);
        if (upload != null) { try { upload.stream.close(); } finally { Files.deleteIfExists(upload.file.toPath()); } }
    }
    synchronized void close() {
        for (String uploadId : new ArrayList<>(uploads.keySet())) try { abort(uploadId); } catch (IOException ignored) { }
    }
    synchronized File privateFile(String value) throws IOException {
        try {
            URI uri = URI.create(value);
            if (!"file".equals(uri.getScheme()) || uri.getAuthority() != null || uri.getQuery() != null || uri.getFragment() != null)
                throw new IllegalArgumentException();
            File file = new File(uri).getCanonicalFile();
            String name = file.getName();
            if (!root.equals(file.getParentFile()) || !name.endsWith(".audio") || !file.isFile() || file.length() < 1 || file.length() > MAX_BYTES)
                throw new IllegalArgumentException();
            validateId(name.substring(0, name.length() - 6));
            return file;
        } catch (IllegalArgumentException invalid) { throw new IOException("This private audio copy is unavailable. Copy the original audio again."); }
    }
    synchronized void remove(String id) throws IOException {
        validateId(id);
        for (Map.Entry<String, Upload> entry : new ArrayList<>(uploads.entrySet())) if (entry.getValue().id.equals(id)) abort(entry.getKey());
        Files.deleteIfExists(target(id).toPath());
    }
    private Upload upload(String uploadId) throws IOException {
        Upload upload = uploads.get(uploadId);
        if (upload == null) throw new IOException("This audio copy has expired. Retry copying the track.");
        return upload;
    }
    private File target(String id) throws IOException {
        File file = new File(root, id + ".audio");
        if (!root.equals(file.getCanonicalFile().getParentFile())) throw new IOException("Invalid private audio file.");
        return file;
    }
}
