import DevicePushToken from '../models/DevicePushToken.js';
import PushDelivery from '../models/PushDelivery.js';
import Station from '../models/Station.js';


export async function sendBroadcastLivePush({ recipients, broadcast }) {
  const userIds = [...new Set(recipients.map((recipient) => String(recipient._id || recipient)))];
  if (!userIds.length) return;

  const tokens = await DevicePushToken.find({ userId: { $in: userIds }, active: true }).select('token userId');
  if (!tokens.length) return;

  const station = broadcast.station?.name
    ? broadcast.station
    : await Station.findById(broadcast.station?._id || broadcast.station).select('name');
  const stationName = String(station?.name || 'Echoo Station');
  const channelTitle = /channel$/i.test(stationName)
    ? stationName
    : `${stationName} channel`;
  const messages = tokens.map(({ token }) => ({
    to: token,
    sound: 'default',
    priority: 'high',
    ttl: 1800,
    channelId: 'live-alerts',
    title: `${channelTitle} is live`,
    body: `${broadcast.title} is live now on Echoo.`,
    data: {
      type: 'broadcast_live',
      broadcastId: String(broadcast._id),
      title: String(broadcast.title || 'Live broadcast'),
      stationName,
      ...(broadcast.coverArt ? { coverArt: String(broadcast.coverArt) } : {}),
    },
  }));

  if (!messages.length) return;
  await PushDelivery.bulkWrite(messages.map((message, index) => ({ updateOne: {
    filter: { broadcastId: broadcast._id, userId: tokens[index].userId, token: message.to },
    update: { $setOnInsert: { broadcastId: broadcast._id, userId: tokens[index].userId, token: message.to,
      message, state: 'queued', attempts: 0, receiptAttempts: 0, nextAt: new Date(), lockedUntil: new Date(0),
      expiresAt: new Date(Date.now() + 30 * 60_000), purgeAt: new Date(Date.now() + 7 * 86400_000) } }, upsert: true,
  } })), { ordered: false });
}
