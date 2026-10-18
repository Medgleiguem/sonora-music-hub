import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../lib/process.mjs';

test('returns output from a successful child', async () => {
  assert.equal(await runProcess(process.execPath, ['-e', 'process.stdout.write("ready")']), 'ready');
});
test('terminates work at its deadline', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 80 }), { name: 'TimeoutError' });
});
test('cancels a running child', async () => {
  const controller = new AbortController();
  const pending = runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal });
  setTimeout(() => controller.abort(), 80);
  await assert.rejects(pending, { name: 'AbortError' });
});
test('does not spawn work after cancellation', async () => {
  await assert.rejects(runProcess('does-not-exist', [], { signal: AbortSignal.abort() }), { name: 'AbortError' });
});
test('bounds child output', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], { maxOutput: 100 }), /too much output/);
});

test('preserves Arabic UTF-8 characters split across pipe chunks', async () => {
  const output = await runProcess(process.execPath, ['-e', 'process.stdout.write(Buffer.from([0xd8])); setTimeout(() => process.stdout.write(Buffer.from([0xa7])), 50)']);
  assert.equal(output, 'ا');
});
