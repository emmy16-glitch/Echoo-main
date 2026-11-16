import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/localDownloads.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const files = new Map();
  let account = 'A', transfers = 0, remoteDeletes = 0;
  let transfer = async (_url, uri) => { files.set(uri, 'audio'); return { uri, status: 200 }; };
  const api = { API_URL: 'https://echoo.test/api', hasEchooSession: async () => true, getAccessToken: async () => 'token',
    requestDownload: async () => ({ id: 'server-download', trackId: 'track' }), updateDownloadProgress: async () => undefined,
    removeDownload: async () => { remoteDeletes++; } };
  const fs = { documentDirectory: 'file:///app/', makeDirectoryAsync: async () => undefined,
    readAsStringAsync: async (path) => { if (!files.has(path)) throw new Error('missing'); return files.get(path); },
    writeAsStringAsync: async (path, data) => { files.set(path, data); },
    getInfoAsync: async (path) => ({ exists: files.has(path), size: files.has(path) ? files.get(path).length : 0 }),
    deleteAsync: async (path) => { files.delete(path); },
    downloadAsync: async (...args) => { transfers++; return transfer(...args); } };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name) => {
    if (name === 'react-native') return { Platform: { OS: 'ios' } };
    if (name === 'expo-secure-store') return { getItemAsync: async () => account };
    if (name === 'expo-file-system/legacy') return fs;
    if (name.includes('echooApi')) return api;
    throw new Error(name);
  } });
  return { service: module.exports, files, fs, setAccount: (id) => { account = id; }, setTransfer: (fn) => { transfer = fn; },
    transfers: () => transfers, remoteDeletes: () => remoteDeletes };
}

test('repeated taps use one transfer and one indexed device copy', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.service.downloadAudioToDevice({ id: 'track' }), f.service.downloadAudioToDevice({ id: 'track' })]);
  assert.equal(a.localUri, b.localUri); assert.equal(f.transfers(), 1);
  assert.equal((await f.service.getLocalDownloads()).length, 1);
});
test('concurrent different downloads retain both index entries', async () => {
  const f = fixture();
  await Promise.all([f.service.downloadAudioToDevice({ id: 'one' }), f.service.downloadAudioToDevice({ id: 'two' })]);
  assert.equal((await f.service.getLocalDownloads()).length, 2);
});
test('missing saved file is never returned as an offline playback source', async () => {
  const f = fixture();
  const saved = await f.service.downloadAudioToDevice({ id: 'track' });
  f.files.delete(saved.localUri);
  assert.equal(await f.service.getLocalDownloadForTrack('track'), null);
});
test('account switch during a transfer cannot index audio for another user', async () => {
  const f = fixture();
  f.setTransfer(async (_url, uri) => { f.files.set(uri, 'audio'); f.setAccount('B'); return { uri, status: 200 }; });
  await assert.rejects(f.service.downloadAudioToDevice({ id: 'track' }), /account changed/);
  assert.equal(f.files.has('file:///app/echoo-downloads/B/downloads.json'), false);
  assert.equal(f.files.has('file:///app/echoo-downloads/A/track.mp3'), false);
});
test('removing an offline copy never deletes server or other-device download records', async () => {
  const f = fixture();
  const saved = await f.service.downloadAudioToDevice({ id: 'track' });
  await f.service.deleteLocalDownload(saved);
  assert.equal(f.remoteDeletes(), 0); assert.equal(f.files.has(saved.localUri), false);
  assert.equal((await f.service.getLocalDownloads()).length, 0);
});
test('HTML error responses cannot be saved as successful audio downloads', async () => {
  const f = fixture();
  f.setTransfer(async (_url, uri) => { f.files.set(uri, '<html>error</html>'); return { uri, status: 200, headers: { 'Content-Type': 'text/html' } }; });
  await assert.rejects(f.service.downloadAudioToDevice({ id: 'track' }), /did not return an audio/);
  assert.equal(f.files.has('file:///app/echoo-downloads/A/track.mp3'), false);
});

test('a truncated response is rejected rather than marked downloaded', async () => {
  const f = fixture();
  f.setTransfer(async (_url, uri) => { f.files.set(uri, 'abc'); return { uri, status: 200, headers: { 'Content-Length': '50' } }; });
  await assert.rejects(f.service.downloadAudioToDevice({ id: 'track' }), /incomplete/);
  assert.equal((await f.service.getLocalDownloads()).length, 0);
});
test('a corrupt index is preserved and never overwritten by a new download', async () => {
  const f = fixture();
  const index = 'file:///app/echoo-downloads/A/downloads.json';
  f.files.set(index, '{corrupted');
  await assert.rejects(f.service.downloadAudioToDevice({ id: 'track' }), /Could not read/);
  assert.equal(f.files.get(index), '{corrupted');
});
test('failed deletion preserves the download entry for retry', async () => {
  const f = fixture();
  const saved = await f.service.downloadAudioToDevice({ id: 'track' });
  f.fs.deleteAsync = async () => { throw new Error('File is busy'); };
  await assert.rejects(f.service.deleteLocalDownload(saved), /File is busy/);
  assert.equal((await f.service.getLocalDownloads()).length, 1);
});

test('an interrupted index update preserves the last complete slot', async () => {
  const f = fixture();
  await f.service.downloadAudioToDevice({ id: 'first' });
  const write = f.fs.writeAsStringAsync;
  f.fs.writeAsStringAsync = async (path, data) => {
    if (path.endsWith('.b')) { f.files.set(path, '{interrupted'); throw new Error('disk interrupted'); }
    return write(path, data);
  };
  await assert.rejects(f.service.downloadAudioToDevice({ id: 'second' }), /disk interrupted/);
  assert.deepEqual(Array.from(await f.service.getLocalDownloads(), (item) => item.trackId), ['first']);
});
test('a corrupt newest slot falls back to the previous valid index', async () => {
  const f = fixture();
  await f.service.downloadAudioToDevice({ id: 'first' });
  await f.service.downloadAudioToDevice({ id: 'second' });
  f.files.set('file:///app/echoo-downloads/A/downloads.json.b', 'broken');
  assert.deepEqual(Array.from(await f.service.getLocalDownloads(), (item) => item.trackId), ['first']);
});
