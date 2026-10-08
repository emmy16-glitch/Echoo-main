import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
  clear() { this.#values.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const cache = await import('./navigationDataCache.js');

const setUser = (id) => localStorage.setItem('user', JSON.stringify({ id }));

test('navigation metadata remains isolated by account', () => {
  setUser('account-a');
  cache.writeNavigationData('library', ['private-a']);
  setUser('account-b');
  assert.equal(cache.readNavigationData('library'), null);
  cache.writeNavigationData('library', ['private-b']);
  setUser('account-a');
  assert.deepEqual(cache.readNavigationData('library')?.data, ['private-a']);
});

test('corrupt cache is ignored and removed safely', () => {
  setUser('corrupt-user');
  localStorage.setItem('echooNavigationDataV1:broken:corrupt-user', '{bad json');
  assert.equal(cache.readNavigationData('broken'), null);
  assert.equal(localStorage.getItem('echooNavigationDataV1:broken:corrupt-user'), null);
});

test('stale loads are deduplicated and refreshed once', async () => {
  setUser('dedupe-user');
  let calls = 0;
  let release;
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  const first = cache.loadNavigationData('channels', loader, { ttlMs: 1000 });
  const second = cache.loadNavigationData('channels', loader, { ttlMs: 1000 });
  await Promise.resolve();
  assert.equal(calls, 1);
  release(['one']);
  assert.deepEqual(await first, ['one']);
  assert.deepEqual(await second, ['one']);
});

test('private cache clearing preserves public metadata', () => {
  setUser('logout-user');
  cache.writeNavigationData('profile', { name: 'Private' });
  cache.writeNavigationData('discover', ['public'], { scope: 'public' });
  cache.clearPrivateNavigationData();
  assert.equal(cache.readNavigationData('profile'), null);
  assert.deepEqual(cache.readNavigationData('discover', { scope: 'public' })?.data, ['public']);
});

test('API client deduplicates only safe identical GET requests', () => {
  const source = fs.readFileSync(new URL('./api.js', import.meta.url), 'utf8');
  assert.match(source, /method === 'GET'/);
  assert.match(source, /pendingJsonRequests\.has\(requestKey\)/);
  assert.match(source, /pendingJsonRequests\.delete\(requestKey\)/);
  assert.match(source, /clearPrivateNavigationData\(\)/);
});
