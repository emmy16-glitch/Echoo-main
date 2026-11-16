import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/models/User.js';
import DevicePushToken from '../src/models/DevicePushToken.js';
import { logout } from '../src/controllers/authController.js';

test('logout revokes only the authenticated user device before acknowledging success', async (t) => {
  const updateDevice = DevicePushToken.updateOne;
  const updateUser = User.updateOne;
  t.after(() => { DevicePushToken.updateOne = updateDevice; User.updateOne = updateUser; });
  const events = [];
  DevicePushToken.updateOne = async (filter, update) => {
    assert.deepEqual(filter, { token: 'device-token', userId: 'account-A' });
    assert.equal(update.$set.active, false); events.push('revoke');
  };
  User.updateOne = async () => { events.push('invalidate-session'); };
  const res = { status(code) { assert.equal(code, 200); return this; }, json() { events.push('success'); } };
  await logout({ userId: 'account-A', body: { pushToken: 'device-token' } }, res, (error) => { throw error; });
  assert.deepEqual(events, ['revoke', 'invalidate-session', 'success']);
});
