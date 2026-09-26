/**
 * Per-printer serial print queue.
 *
 * Guarantees that jobs bound for the SAME printerId run strictly one after
 * another (never concurrent writes to one device), while different printers
 * run fully independently (Printer A never blocks Printer B).
 *
 *   Printer A: A1 -> A2 -> A3
 *   Printer B: B1 -> B2
 *
 * The queue is in-memory and keyed by printerId. A queue entry is removed as
 * soon as its last job settles, so a fresh job starts a fresh chain.
 */

/** printerId -> { tail: Promise, pending: number } */
const queues = new Map();

/**
 * Enqueue a task for a printer. Returns the task's own promise so the caller
 * (the HTTP handler) can await real completion while the queue keeps ordering.
 *
 * @param {string} printerId
 * @param {() => Promise<any>} taskFn
 * @returns {Promise<any>}
 */
function enqueue(printerId, taskFn) {
  const key = printerId || "default";
  const state = queues.get(key) || { tail: Promise.resolve(), pending: 0 };
  queues.set(key, state);

  state.pending += 1;

  const prev = state.tail;
  // Run regardless of whether the previous job resolved or rejected.
  const run = prev.then(
    () => taskFn(),
    () => taskFn()
  );

  const finish = () => {
    state.pending -= 1;
    if (state.pending <= 0 && queues.get(key) === state) {
      queues.delete(key);
    }
  };

  // The tail must never reject, or it would produce unhandled rejections.
  state.tail = run.then(finish, finish);

  return run;
}

/** Number of jobs queued or in-flight for a printer. */
function activeCount(printerId) {
  return queues.get(printerId || "default")?.pending ?? 0;
}

/** Whether a printer currently has any queued/running job. */
function isBusy(printerId) {
  return activeCount(printerId) > 0;
}

/** Pending counts per printer (diagnostics/tests). */
function snapshot() {
  const out = {};
  for (const [id, s] of queues.entries()) out[id] = s.pending;
  return out;
}

module.exports = { enqueue, activeCount, isBusy, snapshot };