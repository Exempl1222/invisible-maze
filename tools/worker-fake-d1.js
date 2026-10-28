// An in-memory stand-in for the D1 binding, for the Worker's unit tests. It knows exactly the four
// statements in worker/src/store.js (matched by their text) and nothing else, so a new statement in
// the Worker fails loudly here until the fake learns it. Not a test file (no .test.js in the name).
import { SQL } from '../worker/src/store.js';

export function fakeD1() {
  const results = new Map(); // "device|mode|date" -> row
  const rate = new Map(); // "device|day" -> n
  const log = [];

  function run(sql, args) {
    log.push(sql);
    switch (sql) {
      case SQL.bumpRate: {
        const k = `${args[0]}|${args[1]}`;
        const n = (rate.get(k) ?? 0) + 1;
        rate.set(k, n);
        return { first: { n }, all: [{ n }], changes: 1 };
      }
      case SQL.purgeRate: {
        let changes = 0;
        for (const k of [...rate.keys()]) if (k.split('|')[1] < args[0]) { rate.delete(k); changes++; }
        return { first: null, all: [], changes };
      }
      case SQL.saveResult: {
        const [device, mode, date, score, tries, hint, received] = args;
        const k = `${device}|${mode}|${date}`;
        if (results.has(k)) return { first: null, all: [], changes: 0 }; // INSERT OR IGNORE
        results.set(k, { device, mode, date, score, tries, hint, received });
        return { first: null, all: [], changes: 1 };
      }
      case SQL.spread: {
        const counts = new Map();
        for (const r of results.values()) if (r.mode === args[0] && r.date === args[1]) counts.set(r.score, (counts.get(r.score) ?? 0) + 1);
        const rows = [...counts].map(([score, n]) => ({ score, n }));
        return { first: rows[0] ?? null, all: rows, changes: 0 };
      }
      default:
        throw new Error(`fake D1 does not know this statement: ${sql}`);
    }
  }

  return {
    results,
    rate,
    log,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() { return run(sql, args).first; },
        async all() { return { results: run(sql, args).all }; },
        async run() { return { meta: { changes: run(sql, args).changes } }; },
      };
      return stmt;
    },
  };
}
