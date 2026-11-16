import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/libraryPagination.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports });
const { collectLibraryPages } = module.exports;
test('liked tracks and remote downloads include records after the first page', async () => {
  for (const field of ['tracks', 'downloads', 'history']) {
    const pages = [];
    const rows = await collectLibraryPages({ data: { [field]: [1, 2], pagination: { totalPages: 3 } } }, field, async (page) => {
      pages.push(page); return { data: { [field]: [page + 1] } };
    });
    assert.deepEqual(pages, [2, 3]); assert.deepEqual(Array.from(rows), [1, 2, 3, 4]);
  }
});
test('a failed subsequent page does not silently report a complete library', async () => {
  await assert.rejects(collectLibraryPages({ data: { tracks: [1], pagination: { totalPages: 2 } } }, 'tracks', async () => { throw new Error('offline'); }), /offline/);
});
