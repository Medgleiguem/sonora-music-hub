import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativePlayerClient } from '../src/native-player-core.mjs';

function fixture(overrides = {}) {
  const calls = [];
  const bridge = {
    stageStart: async options => { calls.push(['start', options]); return { uploadId: 'upload-1' }; },
    stageChunk: async options => { calls.push(['chunk', options]); },
    stageFinish: async options => { calls.push(['finish', options]); return { uri: 'file:///private/audio' }; },
    stageAbort: async options => { calls.push(['abort', options]); },
    setOptions: async options => { calls.push(['options', options]); },
    setQueue: async options => { calls.push(['queue', options]); },
    insert: async options => { calls.push(['insert', options]); },
    ...overrides
  };
  return { bridge, calls, client: createNativePlayerClient(bridge) };
}

test('native staging transfers bounded chunks exactly once and sends only queue metadata', async () => {
  const { client, calls } = fixture();
  const bytes = new Uint8Array(600000).map((_, index) => index % 251);
  const track = { id: 'local-track', title: 'A song', source: 'local', blob: new Blob([bytes]), cover: 'data:image/png;base64,private' };
  await client.playQueue([track], 0);
  const chunks = calls.filter(([type]) => type === 'chunk').map(([, item]) => Buffer.from(item.data, 'base64'));
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every(chunk => chunk.length <= 256 * 1024));
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(bytes));
  const item = calls.find(([type]) => type === 'queue')[1].items[0];
  assert.equal(item.uri, 'file:///private/audio');
  assert.equal(item.blob, undefined);
  assert.equal(item.cachedBlob, undefined);
  assert.equal(item.cover, '');
  await client.playQueue([track], 0);
  assert.equal(calls.filter(([type]) => type === 'start').length, 1);
});

test('cancelled native staging discards its partial file and never replaces the playing queue', async () => {
  const controller = new AbortController();
  const { client, calls } = fixture({ stageChunk: async () => controller.abort() });
  await assert.rejects(client.playQueue([{ id: 'local-cancel', blob: new Blob(['abc']) }], 0, { signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(calls.filter(([type]) => type === 'abort'), [['abort', { uploadId: 'upload-1' }]]);
  assert.equal(calls.some(([type]) => type === 'queue'), false);
});

test('native streaming queues preserve track identity without downloading or staging audio', async () => {
  const { client, calls } = fixture();
  await client.playQueue([{ id: 'youtube-jNQXAC9IVRw', externalId: 'jNQXAC9IVRw', title: 'Clip', source: 'youtube', shareUrl: 'https://youtu.be/jNQXAC9IVRw' }], 0);
  assert.equal(calls.some(([type]) => type === 'start'), false);
  const item = calls.find(([type]) => type === 'queue')[1].items[0];
  assert.equal(item.externalId, 'jNQXAC9IVRw');
  assert.equal(item.source, 'youtube');
});

test('existing native audio can be reused after a WebView recreation without another upload', async () => {
  const { client, calls } = fixture({ stageStart: async () => ({ uri: 'file:///private/existing' }) });
  await client.playQueue([{ id: 'existing-track', blob: new Blob(['abc']) }], 0);
  assert.equal(calls.some(([type]) => type === 'chunk'), false);
  assert.equal(calls.find(([type]) => type === 'queue')[1].items[0].uri, 'file:///private/existing');
});

test('an invalid later track cannot block playback of the selected song', async () => {
  const { client, calls } = fixture();
  const result = await client.playQueue([
    { id: 'youtube-jNQXAC9IVRw', externalId: 'jNQXAC9IVRw', source: 'youtube' },
    { id: 'missing-file', source: 'local' }
  ], 0);
  assert.equal(calls.find(([type]) => type === 'queue')[1].items[0].id, 'youtube-jNQXAC9IVRw');
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].id, 'missing-file');
});

test('selected audio starts before a slow later upload finishes', async () => {
  let continueUpload;
  const gate = new Promise(resolve => { continueUpload = resolve; });
  const { client, calls } = fixture({ stageStart: async () => { await gate; return { uri: 'file:///private/later' }; } });
  const playing = client.playQueue([
    { id: 'youtube-jNQXAC9IVRw', externalId: 'jNQXAC9IVRw', source: 'youtube' },
    { id: 'slow-file', blob: new Blob(['abc']) }
  ], 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.filter(([type]) => type === 'queue').length, 1);
  continueUpload();
  await playing;
  assert.equal(calls.find(([type]) => type === 'insert')[1].index, 1);
  assert.equal(calls.find(([type]) => type === 'insert')[1].requestId, calls.find(([type]) => type === 'queue')[1].requestId);
});
