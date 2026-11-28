import test from 'node:test';
import assert from 'node:assert/strict';
import DevicePushToken from '../src/models/DevicePushToken.js';
import PushDelivery from '../src/models/PushDelivery.js';
import Station from '../src/models/Station.js';
import { sendBroadcastLivePush } from '../src/services/expoPushService.js';

test('live push names the followed station in its title', async (t) => {
  const originals = {
    findTokens: DevicePushToken.find,
    findStation: Station.findById,
    bulkWrite: PushDelivery.bulkWrite,
  };
  t.after(() => {
    DevicePushToken.find = originals.findTokens;
    Station.findById = originals.findStation;
    PushDelivery.bulkWrite = originals.bulkWrite;
  });

  let queuedMessages = [];
  DevicePushToken.find = () => ({
    select: async () => [{ token: 'device-token', userId: 'listener-id' }],
  });
  Station.findById = (stationId) => {
    assert.equal(String(stationId), 'station-id');
    return { select: async () => ({ name: 'Layers of Truth' }) };
  };
  PushDelivery.bulkWrite = async (operations) => {
    queuedMessages = operations.map((operation) => operation.updateOne.update.$setOnInsert.message);
  };

  await sendBroadcastLivePush({
    recipients: [{ _id: 'listener-id' }],
    broadcast: {
      _id: 'broadcast-id',
      title: 'Sunday teaching',
      station: 'station-id',
    },
  });

  assert.equal(queuedMessages.length, 1);
  assert.equal(queuedMessages[0].title, 'Layers of Truth channel is live');
  assert.equal(queuedMessages[0].data.stationName, 'Layers of Truth');
});
