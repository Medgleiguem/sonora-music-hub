import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ffmpeg from 'ffmpeg-static';
import { runProcess } from '../lib/process.mjs';
import { POST } from '../app/api/youtube/download/route.js';
import { readDownloadStream } from '../src/download-stream.mjs';

const request = (body, origin) => new Request('http://localhost/api/youtube/download', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) } });
test('rejects malformed download URLs and cross-origin submissions before conversion', async () => {
  assert.equal((await POST(request({ url: 'https://example.org/test.mp3' }))).status, 400);
  assert.equal((await POST(request({ url: 'https://youtube.com/watch?v=BaW_jenozKc', format: 'constructor' }))).status, 400);
  assert.equal((await POST(request({ url: 'https://youtube.com/watch?v=BaW_jenozKc' }, 'https://example.org'))).status, 403);
});

test('Vercel gives an immediate Android alternative instead of spawning a refused cloud conversion', async () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = '1';
  try {
    const response = await POST(request({ url: 'https://youtu.be/jNQXAC9IVRw', format: 'mp3' }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'ANDROID_DOWNLOAD_REQUIRED');
  } finally {
    if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;
  }
});

test('same-origin route streams a native conversion and cleans its temporary files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sonora-route-test-'));
  const oldPath = process.env.YT_DLP_PATH;
  try {
    const input = join(directory, 'input.wav');
    await runProcess(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', input]);
    // Stub only upstream extraction; exercise real process spawning, conversion, route and client parser.
    const stub = join(directory, 'extractor');
    await writeFile(stub, `#!${process.execPath}\nconst fs = require('node:fs'); const a = process.argv; if (a.includes('--dump-single-json')) process.stdout.write(JSON.stringify({title:'Route tone', duration:1})); else fs.copyFileSync(${JSON.stringify(input)}, a[a.indexOf('--output')+1]);`, { mode: 0o755 });
    process.env.YT_DLP_PATH = stub;
    const before = new Set(await readdir(tmpdir()));
    const response = await POST(request({ url: 'https://youtube.com/watch?v=BaW_jenozKc', format: 'mp3' }, 'http://localhost'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    const stages = [];
    const result = await readDownloadStream(response, (event) => stages.push(event.stage));
    assert.equal(result.title, 'Route tone');
    assert.equal(result.blob.type, 'audio/mpeg');
    assert.ok(result.blob.size > 1000);
    assert.ok(stages.includes('downloading') && stages.includes('converting') && stages.includes('receiving'));
    assert.deepEqual((await readdir(tmpdir())).filter((name) => name.startsWith('sonora-') && !before.has(name)), []);
  } finally {
    if (oldPath === undefined) delete process.env.YT_DLP_PATH; else process.env.YT_DLP_PATH = oldPath;
    await rm(directory, { recursive: true, force: true });
  }
});
