import { createRemovalQueue } from './removalQueue';

/*
 * One background-removal worker for the whole page, made on first use and
 * never terminated - an idle worker costs nothing, and StrictMode's double
 * effect cleanup in dev can't then kill it under a running job.
 */
let worker = null;
let nextId = 0;
const waiting = new Map(); // id -> { resolve, reject }

/* Set once the model has loaded and a first photo came back - until then the review says it's preparing. */
export const removalWarm = { value: false };

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./backgroundRemoval.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: { id, blob, error } }) => {
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    if (error) job.reject(new Error(error));
    else {
      removalWarm.value = true;
      job.resolve(blob);
    }
  };
  worker.onerror = (event) => dropWorker(event.message || 'Background removal stopped.');
  return worker;
}

/* A broken or stuck worker fails every job it holds rather than hanging them, and is
   dropped so the next job (Try again) gets a fresh one instead of a dead one. */
function dropWorker(message) {
  for (const job of waiting.values()) job.reject(new Error(message));
  waiting.clear();
  worker?.terminate();
  worker = null;
}

/* Long enough for a first run's model download on a slow line; a worker that dies
   silently (out of memory, with no onerror) is given up on after this. */
const JOB_TIMEOUT_MS = 3 * 60 * 1000;

/** The photo with its background removed, as a PNG Blob. */
export function removeBackgroundOffThread(file) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      if (waiting.has(id)) dropWorker('Background removal took too long.');
    }, JOB_TIMEOUT_MS);
    const done = (settle) => (value) => {
      clearTimeout(timer);
      settle(value);
    };
    waiting.set(id, { resolve: done(resolve), reject: done(reject) });
    getWorker().postMessage({ id, file });
  });
}

/* The page's removals, one at a time - keyed `add:<localId>` / `edit:<id>`. */
export const photoQueue = createRemovalQueue(removeBackgroundOffThread);
