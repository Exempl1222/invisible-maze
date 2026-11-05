import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openRange, isOpenDate } from '../assets/js/daily/window.js';
import { getToken, SCRIPT_URL } from '../assets/js/daily/turnstile.js';

test('openRange: UTC-12 local date minus 6 hours, to UTC+14 local date', () => {
  assert.deepEqual(openRange(Date.parse('2026-11-04T12:00:00Z')), { first: '2026-11-03', last: '2026-11-05' });
  assert.deepEqual(openRange(Date.parse('2026-11-04T17:59:59Z')), { first: '2026-11-03', last: '2026-11-05' });
  assert.deepEqual(openRange(Date.parse('2026-11-04T18:00:00Z')), { first: '2026-11-04', last: '2026-11-05' });
  assert.deepEqual(openRange(Date.parse('2026-11-04T09:59:59Z')), { first: '2026-11-03', last: '2026-11-04' });
  assert.deepEqual(openRange(new Date('2026-11-04T10:00:00Z')), { first: '2026-11-03', last: '2026-11-05' });
  assert.deepEqual(openRange(Date.parse('2026-12-31T10:00:00Z')), { first: '2026-12-30', last: '2027-01-01' }, 'across a year end');
});

test('isOpenDate: inside, on the edges, outside, and not a date', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  for (const d of ['2026-11-03', '2026-11-04', '2026-11-05']) assert.equal(isOpenDate(d, now), true, d);
  for (const d of ['2026-11-02', '2026-11-06', '2025-11-04', 'nope', '2026-02-30', 20261104, null, undefined]) assert.equal(isOpenDate(d, now), false, String(d));
});

/** A fake document and window: records what the page would load and lets the test play Cloudflare. */
function fakePage({ script = 'ok', widget = 'token' } = {}) {
  const appended = [];
  const removed = [];
  const win = {};
  const doc = {
    head: { appendChild: (s) => {
      appended.push(s.src);
      queueMicrotask(() => {
        if (script === 'ok') { win.turnstile = api; s.onload(); } else s.onerror();
      });
    } },
    body: { appendChild: () => {} },
    createElement: () => ({ setAttribute() {}, style: {}, remove() { removed.push('host'); } }),
  };
  const api = {
    render: (host, opts) => {
      queueMicrotask(() => (widget === 'token' ? opts.callback('tok-123') : widget === 'error' ? opts['error-callback']() : widget === 'empty' ? opts.callback('') : null));
      return 'w1';
    },
    remove: (id) => removed.push(id),
  };
  return { doc, win, appended, removed };
}

test('Turnstile off (no site key): no script, no token, nothing touched', async () => {
  const p = fakePage();
  assert.equal(await getToken(null, p.doc, p.win), null);
  assert.equal(await getToken('', p.doc, p.win), null);
  assert.deepEqual(p.appended, []);
});

test('Turnstile on: loads Cloudflare\'s script on demand and gives the token, then cleans up', async () => {
  const p = fakePage();
  assert.equal(await getToken('site-key', p.doc, p.win), 'tok-123');
  assert.deepEqual(p.appended, [SCRIPT_URL]);
  assert.match(SCRIPT_URL, /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit$/);
  assert.ok(p.removed.includes('w1') && p.removed.includes('host'));
});

test('Turnstile on: a widget error, an empty token or a blocked script is null, never a throw', async () => {
  for (const o of [{ widget: 'error' }, { widget: 'empty' }]) {
    const p = fakePage(o);
    assert.equal(await getToken('site-key', p.doc, p.win), null, JSON.stringify(o));
  }
  const blocked = fakePage({ script: 'blocked' });
  assert.equal(await getToken('site-key', blocked.doc, blocked.win), null);
});
