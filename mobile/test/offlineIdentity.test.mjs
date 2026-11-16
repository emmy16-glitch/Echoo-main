import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

test('offline downloads survive a missing access token, remain scoped, and reject guest mutations', async () => {
  const source = await readFile(new URL('../src/services/localDownloads.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let signedIn = true;
  let account = 'listener-A';
  const paths = [];
  const api = { hasEchooSession: async () => signedIn, getAccessToken: async () => null };
  const FileSystem = { documentDirectory: 'file:///app/', readAsStringAsync: async (path) => {
    paths.push(path);
    return JSON.stringify({ track: { trackId: 'track', status: 'completed', localUri: 'file:///app/track.mp3', track: { id: 'track' } } });
  }, getInfoAsync: async () => ({ exists: true, size: 123 }) };
  const module = { exports: {} };
  const context = { module, exports: module.exports, require: (name) => {
    if (name === 'react-native') return { Platform: { OS: 'ios' } };
    if (name === 'expo-secure-store') return { getItemAsync: async () => account };
    if (name === 'expo-file-system/legacy') return FileSystem;
    if (name.includes('echooApi')) return api;
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(compiled, context);
  assert.equal((await module.exports.getLocalDownloads()).length, 1);
  assert.ok(paths.every((path) => path.startsWith('file:///app/echoo-downloads/listener-A/')));
  paths.length = 0;
  account = 'listener-B';
  await module.exports.getLocalDownloads();
  assert.ok(paths.every((path) => path.startsWith('file:///app/echoo-downloads/listener-B/')));
  const reads = paths.length;
  signedIn = false;
  assert.equal((await module.exports.getLocalDownloads()).length, 0);
  assert.equal(paths.length, reads);
  await assert.rejects(module.exports.downloadAudioToDevice({ id: 'track' }), /Sign in/);
});
