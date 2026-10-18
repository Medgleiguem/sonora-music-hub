import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeSource, audioFormat, validateVideo } from '../lib/youtube-input.mjs';
test('canonicalizes a video and strips playlist/tracking parameters', () => {
  assert.equal(youtubeSource('https://youtu.be/BaW_jenozKc?list=PL1234567890&t=5'), 'https://www.youtube.com/watch?v=BaW_jenozKc');
});
test('rejects non-video URLs, deceptive hosts, credentials and ports', () => {
  for (const url of ['https://youtube.com.evil.test/watch?v=BaW_jenozKc', 'https://youtube.com/', 'https://user@youtube.com/watch?v=BaW_jenozKc', 'https://youtube.com:8080/watch?v=BaW_jenozKc', 'file:///tmp/a']) assert.throws(() => youtubeSource(url));
});
test('canonicalizes only valid playlist IDs', () => {
  assert.equal(youtubeSource('https://youtube.com/watch?v=BaW_jenozKc&list=PL1234567890', true), 'https://www.youtube.com/playlist?list=PL1234567890');
  assert.throws(() => youtubeSource('https://youtube.com/playlist?list=', true));
});
test('rejects inherited format names and unbounded video durations', () => {
  assert.throws(() => audioFormat('constructor'));
  assert.throws(() => validateVideo({ is_live: true, duration: 5 }));
  assert.throws(() => validateVideo({ duration: 1801 }));
  assert.throws(() => validateVideo({}));
  assert.doesNotThrow(() => validateVideo({ duration: 1800 }));
});
