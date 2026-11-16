import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/localCache.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module, exports: module.exports, require: () => ({ Platform: { OS: 'web' } }),
});
test('a playlist fetch started before a mutation cannot refill invalidated cache', async () => {
  const cache = module.exports;
  let finish;
  const old = cache.getCachedJson('playlist-list', { maxAgeMs: 10000 }, () => new Promise((resolve) => { finish = resolve; }));
  for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
  await cache.deleteCachedJson('playlist-list');
  await cache.getCachedJson('playlist-list', { maxAgeMs: 10000 }, async () => ['new playlist']);
  finish(['old playlist']); await old;
  assert.deepEqual(Array.from(await cache.peekCachedJson('playlist-list')), ['new playlist']);
});
