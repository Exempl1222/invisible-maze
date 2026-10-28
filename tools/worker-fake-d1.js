// An in-memory stand-in for the D1 binding, for the Worker's unit tests. It knows exactly the four
// statements in worker/src/store.js (matched by their text) and nothing else, so a new statement in
// the Worker fails loudly here until the fake learns it. Not a test file (no .test.js in the name).
import { SQL } from '../worker/src/store.js';

export function fakeD1() {
  const results = new Map(); // "device|mode|date" -> row
  const counts = new Map(); // "mode|date|score" -> n
  const log = [];
  let reads = 0; // rows handed back by SELECTs, to check /stats stays cheap
  let lastChanges = 0;

  function run(sql, args) {
    log.push(sql);
    switch (sql) {
      case SQL.saveResult: {
        const [device, mode, date, score, tries, hint, received] = args;
        const k = `${device}|${mode}|${date}`;
        if (results.has(k)) return (lastChanges = 0), { all: [], changes: 0 }; // INSERT OR IGNORE
        results.set(k, { device, mode, date, score, tries, hint, received });
        lastChanges = 1;
        return { all: [], changes: 1 };
      }
      case SQL.bumpCount: {
        if (lastChanges > 0) {
          const k = args.join('|');
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        return { all: [], changes: lastChanges > 0 ? 1 : 0 };
      }
      case SQL.spread: {
        const rows = [];
        for (const [k, n] of counts) {
          const [mode, date, score] = k.split('|');
          if (mode === args[0] && date === args[1]) rows.push({ score: Number(score), n });
        }
        reads += rows.length;
        return { all: rows, changes: 0 };
      }
      default:
        throw new Error(`fake D1 does not know this statement: ${sql}`);
    }
  }

  const db = {
    results,
    counts,
    log,
    get reads() { return reads; },
    prepare(sql) {
      let args = [];
      const stmt = {
        sql,
        get args() { return args; },
        bind(...a) { args = a; return stmt; },
        async first() { return run(sql, args).all[0] ?? null; },
        async all() { return { results: run(sql, args).all }; },
        async run() { return { meta: { changes: run(sql, args).changes } }; },
      };
      return stmt;
    },
    /** Statements run in order, all or nothing. A failure part-way rolls the results and counts back. */
    async batch(stmts) {
      const snap = [new Map(results), new Map(counts)];
      try {
        const out = [];
        for (const st of stmts) { const r = run(st.sql, st.args); out.push({ results: r.all, meta: { changes: r.changes } }); }
        return out;
      } catch (err) {
        results.clear(); counts.clear();
        for (const [k, v] of snap[0]) results.set(k, v);
        for (const [k, v] of snap[1]) counts.set(k, v);
        throw err;
      }
    },
  };
  return db;
}
