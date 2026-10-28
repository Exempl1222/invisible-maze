// Everything the Worker says to D1, in one place. The handler talks to this small interface
// (bumpRate, saveResult, spread), so the unit tests can fake D1 by matching these exact statements.

export const SQL = {
  bumpRate: 'INSERT INTO rate (device, day, n) VALUES (?1, ?2, 1) ON CONFLICT (device, day) DO UPDATE SET n = n + 1 RETURNING n',
  purgeRate: 'DELETE FROM rate WHERE day < ?1',
  saveResult: 'INSERT OR IGNORE INTO results (device, mode, date, score, tries, hint, received) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
  spread: 'SELECT score, COUNT(*) AS n FROM results WHERE mode = ?1 AND date = ?2 GROUP BY score',
};

/** The store over a D1 binding. */
export function d1Store(db) {
  return {
    /** Count one post from `device` on UTC `day` and give back how many it has made today (this one included). */
    async bumpRate(device, day) {
      const row = await db.prepare(SQL.bumpRate).bind(device, day).first();
      return row ? Number(row.n) : 1;
    },
    /** Drop rate rows older than `day`. */
    async purgeRate(day) {
      await db.prepare(SQL.purgeRate).bind(day).run();
    },
    /** Keep a result unless that device already has one for the mode and date. True if it was kept, false if it was a repeat. */
    async saveResult(r) {
      const res = await db.prepare(SQL.saveResult).bind(r.device, r.mode, r.date, r.score, r.tries, r.hint ? 1 : 0, r.received).run();
      return (res?.meta?.changes ?? 0) > 0;
    },
    /** [{ score, n }] for a mode and date. */
    async spread(mode, date) {
      const res = await db.prepare(SQL.spread).bind(mode, date).all();
      return (res?.results ?? []).map((r) => ({ score: Number(r.score), n: Number(r.n) }));
    },
  };
}
