import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/sessionLifecycle.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports });
const { createLatestRequestGuard, sessionChanged } = module.exports;
test('a slow response cannot replace the more recently requested page', async () => {
  const guard = createLatestRequestGuard(); let resolveFirst; let displayed = '';
  const first = new Promise((resolve) => { resolveFirst = resolve; });
  const firstActive = guard.begin();
  const pending = first.then((data) => { if (firstActive()) displayed = data; });
  const secondActive = guard.begin();
  if (secondActive()) displayed = 'new page';
  resolveFirst('old page'); await pending;
  assert.equal(displayed, 'new page');
});
test('account changes and route blur invalidate pending personal data', () => {
  const guard = createLatestRequestGuard();
  const accountA = guard.begin(); sessionChanged(); assert.equal(accountA(), false);
  const accountB = guard.begin(); assert.equal(accountB(), true);
  guard.invalidate(); assert.equal(accountB(), false);
});
