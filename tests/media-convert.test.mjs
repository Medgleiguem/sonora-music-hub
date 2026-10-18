import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ffmpeg from 'ffmpeg-static';
import { runProcess } from '../lib/process.mjs';
import { convertAudio } from '../lib/media.mjs';

test('native FFmpeg converts real audio to playable MP3, M4A, and Opus', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sonora-test-'));
  try {
    const input = join(directory, 'input.wav');
    await runProcess(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', input]);
    for (const format of ['mp3', 'm4a', 'opus']) {
      const output = join(directory, `audio.${format}`);
      await convertAudio(input, output, format);
      assert.ok((await stat(output)).size > 1000);
      const bytes = await readFile(output);
      assert.equal(format === 'mp3' ? bytes.subarray(0, 3).toString() : format === 'm4a' ? bytes.subarray(4, 8).toString() : bytes.subarray(0, 4).toString(), format === 'mp3' ? 'ID3' : format === 'm4a' ? 'ftyp' : 'OggS');
      await runProcess(ffmpeg, ['-v', 'error', '-i', output, '-f', 'null', '-']);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
