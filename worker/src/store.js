// Everything the Worker says to D1, in one place. The handler talks to this small interface
// (saveResult, spread), so the unit tests can fake D1 by matching these exact statements.
//
// Free-tier budget: a post is one batch (insert into results, bump one counts row); a repeat post writes
// nothing. GET /stats reads only `counts` (at most 101 rows). There is no per-device rate table: the
// primary key (device, mode, date) already caps what one device id can write at a few rows a day, and
// a table that wrote on every post would spend the daily write allowance faster than it protects it.

export const SQL = {
  saveResult: 'INSERT OR IGNORE INTO results (device, mode, date, score, tries, hint, received) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
  // Runs right after saveResult in the same batch; changes() is 0 when that insert was ignored as a repeat.
  bumpCount: 'INSERT INTO counts (mode, date, score, n) SELECT ?1, ?2, ?3, 1 WHERE changes() > 0 ON CONFLICT (mode, date, score) DO UPDATE SET n = n + 1',
  spread: 'SELECT score, n FROM counts WHERE mode = ?1 AND date = ?2',
};

/** The store over a D1 binding. */
export function d1Store(db) {
  return {
    /** Keep a result unless that device already has one for the mode and date. True if it was kept, false if it was a repeat. */
    async saveResult(r) {
      const out = await db.batch([
        db.prepare(SQL.saveResult).bind(r.device, r.mode, r.date, r.score, r.tries, r.hint ? 1 : 0, r.received),
        db.prepare(SQL.bumpCount).bind(r.mode, r.date, r.score),
      ]);
      return (out?.[0]?.meta?.changes ?? 0) > 0;
    },
    /** [{ score, n }] for a mode and date, from the pre-counted table. */
    async spread(mode, date) {
      const res = await db.prepare(SQL.spread).bind(mode, date).all();
      return (res?.results ?? []).map((r) => ({ score: Number(r.score), n: Number(r.n) }));
    },
  };
}
