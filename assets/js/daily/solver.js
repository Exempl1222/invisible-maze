// Asks the solver worker for a par answer, on demand (v3.4: no answer is shipped or kept in the page).
// Resolves with the answer walls; rejects if the worker can't start, fails, finds nothing, or takes too long.

/** Longest we wait for the worker before giving up. The generator only keeps days that solve within SOLVE_NODE_BUDGET (tools/build-daily.js), about a second in Node on the dev machine at worst, so a phone has a wide margin. */
export const SOLVE_TIMEOUT_MS = 20000;

export function solveInWorker(raw, { timeoutMs = SOLVE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let worker = null;
    let timer = 0;
    const finish = (fn, value) => {
      clearTimeout(timer);
      if (worker) worker.terminate();
      fn(value);
    };
    try {
      worker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(err instanceof Error ? err : new Error('worker did not start'));
      return;
    }
    timer = setTimeout(() => finish(reject, new Error('timeout')), timeoutMs);
    worker.onmessage = (e) => {
      const { ok, answer } = e.data ?? {};
      if (ok && Array.isArray(answer)) finish(resolve, answer);
      else finish(reject, new Error('no answer'));
    };
    worker.onerror = () => finish(reject, new Error('worker error'));
    worker.onmessageerror = () => finish(reject, new Error('worker error'));
    worker.postMessage({ raw });
  });
}
