import assert from 'node:assert/strict';
import test from 'node:test';
import { readListenerVolume, saveListenerVolume } from './listenerVolume.js';
import { getRecordingDevicePreferences, setRecordingDevicePreferences } from './recordingDevicePreferences.js';
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
globalThis.window = { localStorage, dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(type, data) { this.type = type; Object.assign(this, data); } };

test('new listeners receive unity gain; deliberate choices persist across remounts and accounts', () => {
  values.clear();
  assert.equal(readListenerVolume(), 1);
  saveListenerVolume(0.35);
  assert.equal(readListenerVolume(), 0.35);
  localStorage.setItem('user', JSON.stringify({ id: 'account-a' }));
  assert.equal(readListenerVolume(), 1);
  saveListenerVolume(0);
  assert.equal(readListenerVolume(), 0);
  localStorage.setItem('user', JSON.stringify({ id: 'account-b' }));
  assert.equal(readListenerVolume(), 1);
  localStorage.setItem('echooListenerVolumeV1:account-b', 'invalid');
  assert.equal(readListenerVolume(), 1);
});

test('device copies default to opt-in and preserve explicit MP3, WAV, or server-only preferences', () => {
  values.clear();
  assert.deepEqual(getRecordingDevicePreferences(), { decided: false, autoSave: false, format: 'mp3' });
  setRecordingDevicePreferences({ autoSave: true, format: 'wav' });
  assert.deepEqual(getRecordingDevicePreferences(), { decided: true, autoSave: true, format: 'wav' });
  setRecordingDevicePreferences({ autoSave: false });
  assert.equal(getRecordingDevicePreferences().autoSave, false);
  localStorage.setItem('echooRecordingDevicePreferencesV1', '{invalid');
  assert.equal(getRecordingDevicePreferences().autoSave, false);
});
