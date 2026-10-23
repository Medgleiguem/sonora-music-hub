import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker() {
  const listeners = {};
  runInNewContext(source, {
    self: { location: { origin: 'https://sonora.test' }, addEventListener: (name, callback) => { listeners[name] = callback; } },
    URL, Response, Promise, setTimeout,
    fetch: async () => new Response('network response'),
    caches: { open: async () => ({ match: async () => undefined, put: async () => {} }) }
  });
  return async (path, destination = '') => {
    let response;
    listeners.fetch({
      request: { method: 'GET', url: `https://sonora.test${path}`, mode: destination ? 'no-cors' : 'navigate', destination, headers: new Headers() },
      respondWith: value => { response = value; }, waitUntil: () => {}
    });
    if (response) await response;
    return Boolean(response);
  };
}

test('installer pages and release downloads bypass the app-shell navigation cache', async () => {
  const handles = worker();
  for (const path of ['/android', '/downloads/index.html', '/downloads/sonora-android.apk', '/downloads/checksums.json', '/downloads/sonora-android-source.zip']) {
    assert.equal(await handles(path), false, `${path} must not replace the cached app shell`);
  }
});

test('analytics scripts bypass the offline asset cache', async () => {
  const handles = worker();
  assert.equal(await handles('/_vercel/insights/script.js', 'script'), false);
});

test('the music app still uses its navigation cache while APIs bypass it', async () => {
  const handles = worker();
  assert.equal(await handles('/'), true);
  assert.equal(await handles('/api/youtube/search'), false);
});
