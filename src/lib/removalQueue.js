/*
 * Background removals, one at a time and in the order asked. Each job has a
 * key (one per candidate photo): cancelling a key drops its queued job, or -
 * if it's already running - throws its result away, so a candidate removed
 * mid-removal never gets a photo written back onto another card.
 */

function cancelled() {
  const error = new Error('Background removal cancelled.');
  error.name = 'CancelledError';
  return error;
}

export function createRemovalQueue(run) {
  const queue = []; // { key, file, resolve, reject }
  let current = null; // { key, cancelled }

  function pump() {
    if (current || !queue.length) return;
    const job = queue.shift();
    current = { key: job.key, cancelled: false };
    const mine = current;

    Promise.resolve()
      .then(() => run(job.file))
      .then(
        (blob) => (mine.cancelled ? job.reject(cancelled()) : job.resolve(blob)),
        (error) => (mine.cancelled ? job.reject(cancelled()) : job.reject(error))
      )
      .finally(() => {
        current = null;
        pump();
      });
  }

  function cancel(key) {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].key !== key) continue;
      queue[i].reject(cancelled());
      queue.splice(i, 1);
    }
    if (current?.key === key) current.cancelled = true;
  }

  function enqueue(key, file) {
    // a newer photo for the same candidate replaces the old one, queued or running
    cancel(key);
    return new Promise((resolve, reject) => {
      queue.push({ key, file, resolve, reject });
      pump();
    });
  }

  /* Every job, queued or running - for when the page that asked for them goes away. */
  function cancelAll() {
    for (const job of queue.splice(0)) job.reject(cancelled());
    if (current) current.cancelled = true;
  }

  return { enqueue, cancel, cancelAll, pending: () => queue.map((job) => job.key) };
}
