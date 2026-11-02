import DevicePushToken from '../models/DevicePushToken.js';

const validExpoToken = (value) => /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(String(value || ''));

export async function registerPushToken(req, res, next) {
  try {
    const token = String(req.body?.token || '').trim();
    const platform = String(req.body?.platform || '').trim();
    if (!validExpoToken(token) || !['ios', 'android'].includes(platform)) {
      return res.status(400).json({ error: { code: 'INVALID_PUSH_TOKEN', message: 'Invalid push token registration.' } });
    }

    const registration = await DevicePushToken.findOneAndUpdate(
      { token },
      { $set: { userId: req.userId, platform, active: true, lastSeenAt: new Date() } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return res.status(200).json({ data: { id: registration.id, active: true }, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}
