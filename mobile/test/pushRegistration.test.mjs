import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/pushNotifications.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture() {
  let revision = 1, online = false, registered = 0, prompts = 0, permission = 'granted';
  const timers = new Map(); const events = {};
  const AppState = { currentState: 'active', addEventListener: (_name, cb) => { events.app = cb; return { remove() { delete events.app; } }; } };
  const api = { hasEchooSession: async () => true, getCurrentUser: async () => { if (!online) throw new Error('offline'); return { id: 'user' }; }, registerPushToken: async () => { registered++; } };
  const Notifications = { setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ status: permission }), requestPermissionsAsync: async () => { prompts++; return { status: 'granted' }; },
    getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[test]' }), addPushTokenListener: (cb) => { events.token = cb; return { remove() { delete events.token; } }; } };
  const lifecycle = { getSessionRevision: () => revision, subscribeSessionChanges: (cb) => { events.session = cb; return () => { delete events.session; }; } };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports,
    setTimeout: (cb) => { const id = Symbol(); timers.set(id, cb); return id; }, clearTimeout: (id) => timers.delete(id),
    require: (name) => {
      if (name === 'expo-constants') return { expoConfig: { extra: { eas: { projectId: 'project' } } } };
      if (name === 'expo-notifications') return Notifications;
      if (name === 'expo-secure-store') return { setItemAsync: async () => {} };
      if (name === 'react-native') return { Platform: { OS: 'ios' }, AppState };
      if (name.includes('sessionLifecycle')) return lifecycle;
      if (name.includes('echooApi')) return api;
      throw new Error(name);
    } });
  return { service: module.exports, api, Notifications, events, timers, registered: () => registered, prompts: () => prompts,
    setOnline: (value) => { online = value; }, setPermission: (value) => { permission = value; }, changeSession: () => { revision++; } };
}
test('an offline registration retries successfully and cleanup stops recovery', async () => {
  const f = fixture(); const stop = f.service.startPushRegistrationRecovery(); await flush();
  assert.equal(f.timers.size, 1); assert.equal(f.registered(), 0);
  f.setOnline(true); const callback = [...f.timers.values()][0]; callback(); await flush();
  assert.equal(f.registered(), 1); assert.equal(f.timers.size, 0);
  stop(); assert.equal(f.events.app, undefined); assert.equal(f.events.token, undefined);
});
test('foregrounding and native token changes refresh a registration without prompting', async () => {
  const f = fixture(); f.setOnline(true); const stop = f.service.startPushRegistrationRecovery(); await flush();
  f.events.app('active'); await flush(); f.events.token(); await flush();
  assert.equal(f.registered(), 3); assert.equal(f.prompts(), 0); stop();
});
test('automatic recovery never requests permission but an explicit registration can', async () => {
  const f = fixture(); f.setOnline(true); f.setPermission('undetermined');
  const stop = f.service.startPushRegistrationRecovery(); await flush();
  assert.equal(f.prompts(), 0); assert.equal(f.registered(), 0);
  await f.service.registerEchooPushNotifications();
  assert.equal(f.prompts(), 1); assert.equal(f.registered(), 1); stop();
});
test('a session change during token retrieval cannot register the old account', async () => {
  const f = fixture(); f.setOnline(true);
  f.Notifications.getExpoPushTokenAsync = async () => { f.changeSession(); return { data: 'ExponentPushToken[test]' }; };
  await assert.rejects(f.service.registerEchooPushNotifications(), /session changed/);
  assert.equal(f.registered(), 0);
});
