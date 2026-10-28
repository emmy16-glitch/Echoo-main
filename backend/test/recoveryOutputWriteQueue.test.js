import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderedOutputQueue } from '../src/services/recoveryOutputWriteQueue.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('overlapping audio chunk writes preserve enqueue order per broadcast', async () => {
  const queue = createOrderedOutputQueue();
  const timeline = [];
  const one = queue.append(async () => { timeline.push('one-start'); await delay(15); timeline.push('one-end'); });
  const two = queue.append(async () => { timeline.push('two-start'); await delay(1); timeline.push('two-end'); });
  const three = queue.append(async () => timeline.push('three'));
  await Promise.all([one, two, three]);
  assert.deepEqual(timeline, ['one-start', 'one-end', 'two-start', 'two-end', 'three']);
});

test('a failed optional sink cannot strand later recovery chunks', async () => {
  const queue = createOrderedOutputQueue();
  await assert.rejects(queue.append(async () => { throw new Error('encoder pipe closed'); }), /encoder pipe closed/);
  let completed = false;
  await queue.append(async () => { completed = true; });
  assert.equal(completed, true);
});

test('closing drains pending bytes before refusing new writes', async () => {
  const queue = createOrderedOutputQueue();
  const timeline = [];
  const writing = queue.append(async () => { await delay(10); timeline.push('written'); });
  const stopped = queue.close().then(() => timeline.push('closed'));
  await assert.rejects(queue.append(async () => null), /closing/);
  await Promise.all([writing, stopped]);
  assert.deepEqual(timeline, ['written', 'closed']);
});

test('separate broadcasts do not share one blocking write chain', async () => {
  const a = createOrderedOutputQueue(), b = createOrderedOutputQueue();
  const timeline = [];
  let release = null;
  const locked = new Promise(resolve => { release = resolve; });
  const slow = a.append(async () => { await locked; timeline.push('a'); });
  await b.append(async () => timeline.push('b'));
  assert.deepEqual(timeline, ['b']);
  release();
  await slow;
  assert.deepEqual(timeline, ['b', 'a']);
});
