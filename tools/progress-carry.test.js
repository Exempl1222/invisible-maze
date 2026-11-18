import { test } from 'node:test';
import assert from 'node:assert/strict';

test('progress: stars on p01-01..05 carry to easy-01..05 (higher kept)', async () => {
  const data = { 'invisible-maze:progress:v1': JSON.stringify({ v: 1, best: { 'p01-01': 3, 'p01-02': 1, 'easy-02': 2, 'p01-06': 2 } }) };
  globalThis.window = { localStorage: { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } } };
  const { loadProgress, bestStars } = await import('../assets/js/play/storage.js');
  loadProgress();
  assert.equal(bestStars('easy-01'), 3);
  assert.equal(bestStars('easy-02'), 2); // already higher
  assert.equal(bestStars('easy-03'), 0);
  assert.equal(bestStars('easy-06'), 0); // only 1 to 5 carry
  assert.equal(bestStars('p01-06'), 2);
  delete globalThis.window;
});
