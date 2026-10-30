// Scheduling for concurrent downloads: a shared song limit across all downloads,
// per-download concurrency over a lazily read playlist, and serialized saves.

/** A first-come, first-served limit on work running at once. Waiting callers leave the line when aborted. */
export function createLimiter(limit) {
  let active = 0;
  const waiting = [];
  const next = () => {
    while (active < limit && waiting.length) {
      const entry = waiting.shift();
      if (entry.signal?.aborted) { entry.reject(entry.signal.reason); continue; }
      entry.signal?.removeEventListener('abort', entry.abort);
      active++;
      entry.resolve();
    }
  };
  return {
    get active() { return active; },
    get waiting() { return waiting.length; },
    async run(task, signal) {
      signal?.throwIfAborted();
      await new Promise((resolve, reject) => {
        const entry = { resolve, reject, signal };
        entry.abort = () => {
          const index = waiting.indexOf(entry);
          if (index >= 0) { waiting.splice(index, 1); reject(signal.reason); }
        };
        signal?.addEventListener('abort', entry.abort, { once: true });
        waiting.push(entry);
        next();
      });
      try { return await task(); } finally { active--; next(); }
    }
  };
}

/**
 * Runs `worker` over items from an async iterable, at most `limit` at a time. Items are read only as
 * workers become free, so a long playlist starts downloading before all of it has been listed.
 * The first worker or iteration error stops new work and is rethrown after running workers settle.
 */
export async function forEachConcurrent(items, limit, worker, signal) {
  const iterator = items[Symbol.asyncIterator] ? items[Symbol.asyncIterator]() : items[Symbol.iterator]();
  let failure = null;
  let reading = Promise.resolve();
  // Iterators are not safe to advance concurrently; reads are chained.
  const read = () => (reading = reading.then(() => failure || signal?.aborted ? { done: true } : iterator.next()));
  const lane = async () => {
    for (;;) {
      let step;
      try { step = await read(); } catch (error) { failure ||= { error }; return; }
      if (step.done) return;
      try { await worker(step.value); } catch (error) { failure ||= { error }; return; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, lane));
  if (failure) { await iterator.return?.(); throw failure.error; }
  signal?.throwIfAborted();
}

/** Runs async tasks one after another, so concurrent saves never overwrite each other. */
export function createMutex() {
  let tail = Promise.resolve();
  return (task) => {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  };
}

// Errors that will not change by trying again: missing matches, refused videos, full storage, a stop.
const PERMANENT = /no matching youtube|private|removed|(un)?available in your|not available in your|confirm your age|age-restricted|longer than|up to 30 minutes|30 minutes or less|too large|video is unavailable|out of space|storage permission|install the latest|copyright|members-only|premium|paste a/i;
export const isRetryable = (error) => Boolean(error) && !['AbortError', 'QuotaExceededError'].includes(error.name) && !PERMANENT.test(error.message || '');

const pause = (ms, signal) => new Promise((resolve, reject) => {
  signal?.throwIfAborted();
  const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
  const stop = () => { clearTimeout(timer); reject(signal.reason); };
  signal?.addEventListener('abort', stop, { once: true });
});

/** Runs `task`, trying again after each delay while the error looks temporary (busy, timeouts, dropped connections). */
export async function retry(task, { signal, delays = [1500, 4000, 9000], retryable = isRetryable, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await task(attempt); }
    catch (error) {
      if (signal?.aborted || attempt >= delays.length || !retryable(error)) throw error;
      onRetry?.(error, attempt + 1);
      await pause(delays[attempt], signal);
    }
  }
}
