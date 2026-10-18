import test from 'node:test';
import assert from 'node:assert/strict';
import { readDownloadStream } from '../src/download-stream.mjs';
const response = (events) => new Response(events.map((event) => JSON.stringify(event)).join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
const metadata = { type: 'metadata', size: 3, title: 'A song', mime: 'audio/mpeg' };
test('saves only a complete, size-verified transfer', async () => {
  const result = await readDownloadStream(response([metadata, { type: 'audio', data: 'YWJj' }, { type: 'complete' }]));
  assert.equal(await result.blob.text(), 'abc');
  assert.equal(result.title, 'A song');
});
test('rejects a connection closed before completion', async () => {
  await assert.rejects(readDownloadStream(response([metadata, { type: 'audio', data: 'YWJj' }])), /interrupted/);
});
test('rejects truncated and oversized audio', async () => {
  await assert.rejects(readDownloadStream(response([metadata, { type: 'audio', data: 'YQ==' }, { type: 'complete' }])), /incomplete/);
  await assert.rejects(readDownloadStream(response([{ ...metadata, size: 100 * 1024 * 1024 }])), /too large/);
});
test('preserves actionable converter errors', async () => {
  await assert.rejects(readDownloadStream(response([{ type: 'error', message: 'Choose a shorter video.' }])), /Choose a shorter/);
});
test('parses events split across arbitrary network chunks', async () => {
  const bytes = new TextEncoder().encode([metadata, { type: 'audio', data: 'YWJj' }, { type: 'complete' }].map(JSON.stringify).join('\n') + '\n');
  let offset = 0;
  const streamed = new Response(new ReadableStream({ pull(controller) { if (offset >= bytes.length) return controller.close(); controller.enqueue(bytes.slice(offset, offset += 7)); } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
  assert.equal(await (await readDownloadStream(streamed)).blob.text(), 'abc');
});
