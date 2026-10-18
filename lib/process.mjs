import { spawn } from 'node:child_process';

// Each invocation owns a process group, including any children started by yt-dlp.
export function runProcess(command, args, { cwd, signal, timeoutMs = 45_000, maxOutput = 4 * 1024 * 1024, onStdout } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const grouped = process.platform !== 'win32';
    const child = spawn(command, args, { cwd, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let failure;
    let finished = false;
    const stop = (error) => {
      failure ||= error;
      if (child.pid) {
        try { grouped ? process.kill(-child.pid, 'SIGKILL') : child.kill('SIGKILL'); } catch { /* Already exited. */ }
      }
    };
    const abort = () => stop(signal.reason || new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => stop(new DOMException('This request took too long. Try a shorter track or retry.', 'TimeoutError')), timeoutMs);
    const finish = (error, code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (failure || error) reject(failure || error);
      else if (code !== 0) reject(new Error(stderr.trim() || `Converter exited with code ${code}`));
      else resolve(stdout.trim());
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > maxOutput) stop(new Error('Converter produced too much output.'));
      else if (onStdout) {
        try { onStdout(chunk); } catch (error) { stop(error); }
      }
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-16_384); });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => finish(null, code));
  });
}
