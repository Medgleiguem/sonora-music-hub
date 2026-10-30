import test from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, forEachConcurrent, createMutex } from '../src/download-queue.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('the limiter never runs more than its limit and serves callers in order', async () => {
  const limiter = createLimiter(2);
  let running = 0, peak = 0;
  const order = [];
  await Promise.all([1, 2, 3, 4, 5].map(id => limiter.run(async () => {
    order.push(id); running++; peak = Math.max(peak, running);
    await tick(); running--;
  })));
  assert.equal(peak, 2);
  assert.deepEqual(order, [1, 2, 3, 4, 5]);
  assert.equal(limiter.active, 0);
});

test('an aborted caller leaves the line without blocking later work', async () => {
  const limiter = createLimiter(1);
  let release;
  const first = limiter.run(() => new Promise(resolve => { release = resolve; }));
  const controller = new AbortController();
  const skipped = limiter.run(() => assert.fail('aborted work must not run'), controller.signal);
  const later = limiter.run(async () => 'ran');
  controller.abort(new DOMException('Stopped', 'AbortError'));
  await assert.rejects(skipped, { name: 'AbortError' });
  release();
  await first;
  assert.equal(await later, 'ran');
});

test('items are processed concurrently but read lazily from an async source', async () => {
  let listed = 0, running = 0, peak = 0;
  async function* songs() { for (let index = 1; index <= 6; index++) { listed++; yield index; } }
  const done = [];
  await forEachConcurrent(songs(), 3, async (song) => {
    running++; peak = Math.max(peak, running);
    // At most the running songs plus one lookahead have been listed.
    assert.ok(listed <= done.length + 3);
    await tick(); running--; done.push(song);
  });
  assert.equal(peak, 3);
  assert.deepEqual(done.sort(), [1, 2, 3, 4, 5, 6]);
});

test('a worker error stops new work and is reported', async () => {
  const started = [];
  await assert.rejects(forEachConcurrent([1, 2, 3, 4, 5], 2, async (item) => {
    started.push(item);
    await tick();
    if (item === 2) throw new Error('storage full');
  }), /storage full/);
  assert.ok(started.length < 5);
});

test('stopping ends the run after the songs already started', async () => {
  const controller = new AbortController();
  const started = [];
  await assert.rejects(forEachConcurrent([1, 2, 3, 4, 5, 6], 2, async (item) => {
    started.push(item);
    if (item === 2) controller.abort(new DOMException('Stopped', 'AbortError'));
    await tick();
  }, controller.signal), { name: 'AbortError' });
  assert.deepEqual(started, [1, 2]);
});

test('the mutex serializes saves and survives a failed one', async () => {
  const lock = createMutex();
  const events = [];
  const save = (name, fail) => lock(async () => { events.push(`${name}:start`); await tick(); events.push(`${name}:end`); if (fail) throw new Error(name); });
  await Promise.allSettled([save('a'), save('b', true), save('c')]);
  assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
});

test('temporary failures are retried until they succeed', async () => {
  let calls = 0;
  const { retry } = await import('../src/download-queue.mjs');
  const result = await retry(async () => { calls++; if (calls < 3) throw new Error('Search is busy. Wait a moment and retry.'); return 'saved'; }, { delays: [1, 1, 1] });
  assert.equal(result, 'saved');
  assert.equal(calls, 3);
});

test('permanent failures, stops, and full storage are not retried', async () => {
  const { retry } = await import('../src/download-queue.mjs');
  for (const error of [new Error('No matching YouTube video found for “Song”.'), new DOMException('Download stopped.', 'AbortError'), new DOMException('Full', 'QuotaExceededError')]) {
    let calls = 0;
    await assert.rejects(retry(async () => { calls++; throw error; }, { delays: [1, 1] }), error);
    assert.equal(calls, 1, error.message);
  }
});

test('retries give up after the last delay and stop waiting when aborted', async () => {
  const { retry } = await import('../src/download-queue.mjs');
  let calls = 0;
  await assert.rejects(retry(async () => { calls++; throw new Error('Network error'); }, { delays: [1, 1] }), /Network error/);
  assert.equal(calls, 3);
  const controller = new AbortController();
  const waiting = retry(async () => { throw new Error('Network error'); }, { delays: [60_000], signal: controller.signal });
  setTimeout(() => controller.abort(new DOMException('Stopped', 'AbortError')), 5);
  await assert.rejects(waiting, { name: 'AbortError' });
});

test('only errors that cannot change are treated as permanent', async () => {
  const { isRetryable } = await import('../src/download-queue.mjs');
  for (const message of ['Search is busy. Wait a moment and retry.', 'Invalid download response. Please retry.', 'The download timed out. Try again or choose a shorter video.', 'Could not complete this search. Please retry.', 'Failed to fetch'])
    assert.equal(isRetryable(new Error(message)), true, message);
  for (const message of ['No matching YouTube video found for “Song”.', 'Sign in to confirm your age.', 'Videos up to 30 minutes can be downloaded.', 'This Spotify link is private, removed, or unavailable. Make the playlist public and retry.'])
    assert.equal(isRetryable(new Error(message)), false, message);
});
