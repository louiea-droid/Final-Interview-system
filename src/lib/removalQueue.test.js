// Run with: node src/lib/removalQueue.test.js
import assert from 'node:assert/strict';

import { createRemovalQueue } from './removalQueue.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/* A fake remover: records when each job starts and finishes, resolves on demand. */
function fakeRun() {
  const log = [];
  const waiting = [];
  let running = 0;
  let overlapped = false;
  const run = (file) =>
    new Promise((resolve) => {
      running += 1;
      if (running > 1) overlapped = true;
      log.push(`start ${file}`);
      waiting.push(() => {
        running -= 1;
        log.push(`end ${file}`);
        resolve(`cut ${file}`);
      });
    });
  return { run, log, finishNext: () => waiting.shift()?.(), overlapped: () => overlapped };
}

const isCancelled = (error) => error?.name === 'CancelledError';

// jobs run one at a time, in order
{
  const fake = fakeRun();
  const queue = createRemovalQueue(fake.run);
  const a = queue.enqueue('a', 'A');
  const b = queue.enqueue('b', 'B');
  await tick();
  assert.deepEqual(fake.log, ['start A']);
  assert.deepEqual(queue.pending(), ['b']);
  fake.finishNext();
  assert.equal(await a, 'cut A');
  await tick();
  fake.finishNext();
  assert.equal(await b, 'cut B');
  assert.equal(fake.overlapped(), false);
}

// cancelling a queued job: it rejects and never runs
{
  const fake = fakeRun();
  const queue = createRemovalQueue(fake.run);
  const a = queue.enqueue('a', 'A');
  const b = queue.enqueue('b', 'B');
  queue.cancel('b');
  await assert.rejects(b, isCancelled);
  await tick();
  fake.finishNext();
  await a;
  await tick();
  assert.ok(!fake.log.includes('start B'), 'B never started');
}

// cancelling the running job: its result is ignored, the next job still runs
{
  const fake = fakeRun();
  const queue = createRemovalQueue(fake.run);
  const a = queue.enqueue('a', 'A');
  const b = queue.enqueue('b', 'B');
  await tick();
  queue.cancel('a');
  fake.finishNext();
  await assert.rejects(a, isCancelled);
  await tick();
  fake.finishNext();
  assert.equal(await b, 'cut B');
}

// re-enqueuing a queued key runs only the newer file
{
  const fake = fakeRun();
  const queue = createRemovalQueue(fake.run);
  const a = queue.enqueue('a', 'A');
  const old = queue.enqueue('b', 'B1');
  const fresh = queue.enqueue('b', 'B2');
  await assert.rejects(old, isCancelled);
  await tick();
  fake.finishNext();
  await a;
  await tick();
  fake.finishNext();
  assert.equal(await fresh, 'cut B2');
  assert.ok(!fake.log.includes('start B1'));
}

// re-enqueuing the key that's running: the old result is dropped, the new file runs next
{
  const fake = fakeRun();
  const queue = createRemovalQueue(fake.run);
  const old = queue.enqueue('b', 'B1');
  await tick();
  const fresh = queue.enqueue('b', 'B2');
  fake.finishNext();
  await assert.rejects(old, isCancelled);
  await tick();
  fake.finishNext();
  assert.equal(await fresh, 'cut B2');
}

// a failing job rejects with its own error and doesn't stop the queue
{
  let calls = 0;
  const queue = createRemovalQueue(async (file) => {
    calls += 1;
    if (file === 'bad') throw new Error('boom');
    return `cut ${file}`;
  });
  const bad = queue.enqueue('x', 'bad');
  const good = queue.enqueue('y', 'ok');
  await assert.rejects(bad, /boom/);
  assert.equal(await good, 'cut ok');
  assert.equal(calls, 2);
}

// cancelAll: queued and running jobs are all dropped
{
  const fake = fakeRun();
  const queue = createRemovalQueue(fake.run);
  const running = queue.enqueue('a', 'A');
  const queued = queue.enqueue('b', 'B');
  await tick();
  queue.cancelAll();
  await assert.rejects(queued, isCancelled);
  fake.finishNext();
  await assert.rejects(running, isCancelled);
  assert.deepEqual(queue.pending(), []);
}

console.log('removalQueue: all checks passed');
