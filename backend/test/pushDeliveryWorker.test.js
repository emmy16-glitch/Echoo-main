import test from 'node:test';
import assert from 'node:assert/strict';
import PushDelivery from '../src/models/PushDelivery.js';
import DevicePushToken from '../src/models/DevicePushToken.js';
import Broadcast from '../src/models/Broadcast.js';
import User from '../src/models/User.js';
import { processPushDelivery, retryDelay } from '../src/services/pushDeliveryWorker.js';

test('durable push delivery handles provider failures, receipts and ownership changes', async (t) => {
  const originals = { fetch: global.fetch, update: PushDelivery.updateOne, device: DevicePushToken.exists,
    revoke: DevicePushToken.updateOne, broadcast: Broadcast.exists, user: User.exists };
  t.after(() => {
    global.fetch = originals.fetch; PushDelivery.updateOne = originals.update;
    DevicePushToken.exists = originals.device; DevicePushToken.updateOne = originals.revoke;
    Broadcast.exists = originals.broadcast; User.exists = originals.user;
  });
  let patch, revoked, sent;
  const reset = () => {
    patch = null; revoked = false; sent = false;
    PushDelivery.updateOne = async (_filter, update) => { patch = update.$set; };
    DevicePushToken.exists = User.exists = Broadcast.exists = async () => true;
    DevicePushToken.updateOne = async () => { revoked = true; };
  };
  const job = { _id: 'job', userId: 'user', token: 'token', broadcastId: 'broadcast', state: 'queued', attempts: 0,
    receiptAttempts: 0, lockedUntil: new Date(), expiresAt: new Date(Date.now() + 60_000), message: { to: 'token' } };
  await t.test('accepted ticket is saved for a later receipt check', async () => {
    reset(); global.fetch = async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok', id: 'ticket' }] }) });
    await processPushDelivery(job);
    assert.equal(patch.state, 'receipt'); assert.equal(patch.ticketId, 'ticket');
    assert.ok(patch.nextAt > new Date(Date.now() + 14 * 60_000));
  });
  await t.test('HTTP 503 is retried with backoff rather than lost', async () => {
    reset(); global.fetch = async () => ({ ok: false, status: 503 });
    await processPushDelivery(job);
    assert.equal(patch.state, 'queued'); assert.equal(patch.attempts, 1);
    assert.ok(patch.nextAt > new Date()); assert.ok(retryDelay(4) > retryDelay(1));
  });
  await t.test('invalid credentials fail visibly instead of endless retries', async () => {
    reset(); global.fetch = async () => ({ ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'InvalidCredentials' } }] }) });
    await processPushDelivery(job); assert.equal(patch.state, 'failed'); assert.equal(patch.lastError, 'InvalidCredentials');
  });
  await t.test('receipt disables uninstalled devices', async () => {
    reset(); global.fetch = async () => ({ ok: true, json: async () => ({ data: { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } } }) });
    await processPushDelivery({ ...job, state: 'receipt', ticketId: 'ticket' });
    assert.equal(patch.state, 'failed'); assert.equal(revoked, true);
  });
  await t.test('provider receipt success completes the job', async () => {
    reset(); global.fetch = async () => ({ ok: true, json: async () => ({ data: { ticket: { status: 'ok' } } }) });
    await processPushDelivery({ ...job, state: 'receipt', ticketId: 'ticket' }); assert.equal(patch.state, 'delivered');
  });
  await t.test('changed device ownership cancels queued account notifications', async () => {
    reset(); DevicePushToken.exists = async () => false; global.fetch = async () => { sent = true; };
    await processPushDelivery(job); assert.equal(patch.state, 'cancelled'); assert.equal(sent, false);
  });
  await t.test('ended broadcasts never send delayed go-live alerts', async () => {
    reset(); Broadcast.exists = async () => false; global.fetch = async () => { sent = true; };
    await processPushDelivery(job); assert.equal(patch.state, 'cancelled'); assert.equal(sent, false);
  });
  await t.test('revoked live-alert preference cancels queued alerts', async () => {
    reset(); User.exists = async (query) => { assert.deepEqual(query['preferences.notifications.liveBroadcasts'], { $ne: false }); return false; };
    global.fetch = async () => { sent = true; };
    await processPushDelivery(job); assert.equal(patch.state, 'cancelled'); assert.equal(sent, false);
  });
});
