import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDate, archiveRows, ARCHIVE_DAYS } from '../assets/js/daily/archive.js';

const TODAY = '2026-11-10';

test('no query, or today itself, is today', () => {
  assert.deepEqual(classifyDate(null, TODAY), { kind: 'today', date: TODAY });
  assert.deepEqual(classifyDate(TODAY, TODAY), { kind: 'today', date: TODAY });
});

test('the 29 days before today are the archive', () => {
  assert.equal(ARCHIVE_DAYS, 29);
  assert.deepEqual(classifyDate('2026-11-09', TODAY), { kind: 'archive', date: '2026-11-09' });
  assert.deepEqual(classifyDate('2026-10-12', TODAY), { kind: 'archive', date: '2026-10-12' }); // today - 29
});

test('older than 29 days is out of the archive', () => {
  assert.equal(classifyDate('2026-10-11', TODAY).kind, 'old'); // today - 30
  assert.equal(classifyDate('2020-01-01', TODAY).kind, 'old');
});

test('a future date is not ready', () => {
  assert.equal(classifyDate('2026-11-11', TODAY).kind, 'future');
  assert.equal(classifyDate('2099-12-31', TODAY).kind, 'future');
});

test('a string that is not a real date is out of the archive; an empty query too', () => {
  for (const bad of ['not-a-date', '2026-02-30', '2026-13-01', '27-10-2026', '', ' ']) {
    assert.equal(classifyDate(bad, TODAY).kind, 'old', bad);
  }
});

const won = (stars) => ({ tries: 1, won: true, stars, walls: [], hint: null, done: true, finishedOn: null });
const lost = { tries: 3, won: false, stars: 0, walls: [], hint: null, done: true, finishedOn: null };
const started = { tries: 1, won: false, stars: 0, walls: [], hint: null, done: false, finishedOn: null };

test('archiveRows: 30 rows, newest first, today first and marked, numbered from the batch start', () => {
  const rows = archiveRows({ days: {}, today: TODAY, start: '2026-10-27', count: 365 });
  assert.equal(rows.length, 15); // 10-27 .. 11-10
  assert.equal(rows[0].date, TODAY);
  assert.equal(rows[0].today, true);
  assert.equal(rows[0].number, 15);
  assert.equal(rows.at(-1).date, '2026-10-27');
  assert.equal(rows.at(-1).number, 1);
  assert.equal(rows.filter((r) => r.today).length, 1);
});

test('archiveRows: capped at today plus 29 days, and days before the batch start are left out', () => {
  const rows = archiveRows({ days: {}, today: TODAY, start: '2026-01-01', count: 365 });
  assert.equal(rows.length, 30);
  assert.equal(rows.at(-1).date, '2026-10-12');
  const short = archiveRows({ days: {}, today: '2026-10-28', start: '2026-10-27', count: 365 });
  assert.deepEqual(short.map((r) => r.date), ['2026-10-28', '2026-10-27']);
});

test('archiveRows: days past the end of the batch are left out', () => {
  const rows = archiveRows({ days: {}, today: '2026-10-30', start: '2026-10-27', count: 2 });
  assert.deepEqual(rows.map((r) => r.date), ['2026-10-28', '2026-10-27']);
});

test('archiveRows: result per row', () => {
  const rows = archiveRows({
    days: { '2026-11-10': won(2), '2026-11-09': lost, '2026-11-08': started },
    today: TODAY, start: '2026-10-27', count: 365,
  });
  assert.deepEqual(rows[0].result, { kind: 'won', stars: 2 });
  assert.deepEqual(rows[1].result, { kind: 'lost' });
  assert.deepEqual(rows[2].result, { kind: 'progress' });
  assert.deepEqual(rows[3].result, { kind: 'none' });
});

test('archiveRows: a hint or walls alone count as in progress', () => {
  const hinted = { ...started, tries: 0, hint: '1,1,R' };
  const walled = { ...started, tries: 0, walls: ['1,1,R'] };
  const rows = archiveRows({ days: { [TODAY]: hinted, '2026-11-09': walled }, today: TODAY, start: '2026-10-27', count: 365 });
  assert.equal(rows[0].result.kind, 'progress');
  assert.equal(rows[1].result.kind, 'progress');
});

test('archiveRows: before the batch has started there is nothing', () => {
  assert.deepEqual(archiveRows({ days: {}, today: '2026-10-01', start: '2026-10-27', count: 365 }), []);
});
