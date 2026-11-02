import DevicePushToken from '../models/DevicePushToken.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_MESSAGES_PER_BATCH = 100;

export async function sendBroadcastLivePush({ recipients, broadcast }) {
  const userIds = [...new Set(recipients.map((recipient) => String(recipient._id || recipient)))];
  if (!userIds.length) return;

  const tokens = await DevicePushToken.find({ userId: { $in: userIds }, active: true }).select('token');
  const messages = tokens.map(({ token }) => ({
    to: token,
    sound: 'default',
    priority: 'high',
    channelId: 'live-alerts',
    title: 'A station you follow is live',
    body: `${broadcast.title} is live now on Echoo.`,
    data: {
      type: 'broadcast_live',
      broadcastId: String(broadcast._id),
      title: String(broadcast.title || 'Live broadcast'),
      stationName: String(broadcast.station?.name || 'Echoo Station'),
      ...(broadcast.coverArt ? { coverArt: String(broadcast.coverArt) } : {}),
    },
  }));

  for (let offset = 0; offset < messages.length; offset += MAX_MESSAGES_PER_BATCH) {
    const batch = messages.slice(offset, offset + MAX_MESSAGES_PER_BATCH);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      const payload = await response.json().catch(() => null);
      const invalidTokens = (payload?.data || []).flatMap((ticket, index) =>
        ticket?.details?.error === 'DeviceNotRegistered' ? [batch[index]?.to] : []
      ).filter(Boolean);
      if (invalidTokens.length) await DevicePushToken.updateMany({ token: { $in: invalidTokens } }, { $set: { active: false } });
      if (!response.ok) console.warn('Expo push delivery warning:', response.status);
    } catch (error) {
      console.warn('Expo push delivery warning:', error?.message || error);
    }
  }
}
