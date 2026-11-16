import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/notificationResponses.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports });
const response = (id, data = { type: 'broadcast_live', broadcastId: 'broadcast' }) => ({ actionIdentifier: 'default', notification: { request: { identifier: id, content: { data } } } });
test('a tap reported by both cold-start and live callbacks opens only one room', async () => {
  let opened = 0, cleared = 0;
  const handle = module.exports.createNotificationResponseHandler(() => opened++, async () => { cleared++; });
  handle(response('one')); handle(response('one'));
  await Promise.resolve();
  assert.equal(opened, 1); assert.equal(cleared, 1);
  handle(response('two')); assert.equal(opened, 2);
});
test('unrelated notifications never open a live room and are still consumed', () => {
  let opened = 0, cleared = 0;
  const handle = module.exports.createNotificationResponseHandler(() => opened++, async () => { cleared++; });
  handle(response('unrelated', { type: 'new_follower' }));
  assert.equal(opened, 0); assert.equal(cleared, 1);
});
