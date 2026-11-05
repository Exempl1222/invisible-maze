import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solve } from '../src/game/index.js';
import { levelWithoutLimit } from '../assets/js/daily/judge.js';
import { readCachedAnswer, writeCachedAnswer, answerKey, ANSWER_KEY_PREFIX } from '../assets/js/daily/answer-cache.js';

const easy = JSON.parse(readFileSync(new URL('../assets/levels/daily-easy.json', import.meta.url), 'utf8'));
const raw = easy.levels[0];
const date = raw.id.slice(2);
const answer = solve(levelWithoutLimit(raw), { exactPar: raw.par }).answer;

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    m,
  };
}

test('answer cache: a written answer is read back for the same mode and date, as a copy', () => {
  const st = fakeStorage();
  assert.equal(readCachedAnswer(raw, 'easy', date, st), null);
  assert.equal(writeCachedAnswer('easy', date, answer, st), true);
  assert.ok(st.m.has(answerKey('easy', date)));
  const back = readCachedAnswer(raw, 'easy', date, st);
  assert.deepEqual(back, answer);
  assert.notEqual(back[0], answer[0]);
  assert.equal(readCachedAnswer(raw, 'hard', date, st), null, 'keyed by mode');
  assert.equal(readCachedAnswer(raw, 'easy', '2026-10-28', st), null, 'keyed by date');
});

test('answer cache: a damaged, wrong-sized, losing or illegal entry is ignored', () => {
  const k = answerKey('easy', date);
  for (const bad of ['', 'not json', '{}', '[]', JSON.stringify(answer.slice(1)), JSON.stringify([...answer, answer[0]]), JSON.stringify(answer.map(([x, y]) => [x, y, 'Z'])), JSON.stringify(answer.map(() => [0, 0, 'R'])), JSON.stringify(answer.map(([x, y, d]) => [x + 50, y, d]))]) {
    assert.equal(readCachedAnswer(raw, 'easy', date, fakeStorage({ [k]: bad })), null, bad.slice(0, 40));
  }
});

test('answer cache: storage that is missing or throws never breaks it', () => {
  assert.equal(readCachedAnswer(raw, 'easy', date, null), null);
  assert.equal(writeCachedAnswer('easy', date, answer, null), false);
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, get length() { throw new Error('denied'); } };
  assert.equal(readCachedAnswer(raw, 'easy', date, boom), null);
  assert.equal(writeCachedAnswer('easy', date, answer, boom), false);
  assert.equal(writeCachedAnswer('easy', date, [], fakeStorage()), false, 'nothing to store');
});

test('answer cache: writing drops answers for puzzle dates far behind, and leaves other keys alone', () => {
  const st = fakeStorage({
    [`${ANSWER_KEY_PREFIX}hard:2026-01-01`]: '[]',
    [`${ANSWER_KEY_PREFIX}easy:2026-10-20`]: '[]',
    'gnome-sweet-gnome:daily:v2': '{}',
  });
  writeCachedAnswer('easy', date, answer, st);
  assert.equal(st.m.has(`${ANSWER_KEY_PREFIX}hard:2026-01-01`), false);
  assert.equal(st.m.has(`${ANSWER_KEY_PREFIX}easy:2026-10-20`), true);
  assert.equal(st.m.has('gnome-sweet-gnome:daily:v2'), true);
});
