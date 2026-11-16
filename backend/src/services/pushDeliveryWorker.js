import PushDelivery from '../models/PushDelivery.js';
import DevicePushToken from '../models/DevicePushToken.js';
import Broadcast from '../models/Broadcast.js';
import User from '../models/User.js';

export const retryDelay = (attempt) => Math.min(900_000, 5000 * 2 ** Math.min(attempt, 8));
export const retryablePushError = (code) => ['MessageRateExceeded', 'ExpoServerError', 'ServiceUnavailable'].includes(code);

export async function processPushDelivery(job) {
  const receiptMode = job.state === 'receipt';
  const counter = receiptMode ? 'receiptAttempts' : 'attempts';
  const attempt = (job[counter] || 0) + 1;
  const patch = { [counter]: attempt, lockedUntil: new Date(0) };
  try {
    if (!receiptMode) {
      const [device, user, live] = await Promise.all([
        DevicePushToken.exists({ token: job.token, userId: job.userId, active: true }),
        User.exists({ _id: job.userId, isActive: true, 'preferences.notifications.push': { $ne: false }, 'preferences.notifications.liveBroadcasts': { $ne: false } }),
        Broadcast.exists({ _id: job.broadcastId, status: 'live', isPublic: true, isDeleted: { $ne: true } }),
      ]);
      if (!device || !user || !live || job.expiresAt <= new Date()) {
        await PushDelivery.updateOne({ _id: job._id, lockedUntil: job.lockedUntil }, { $set: { ...patch, state: 'cancelled' } });
        return;
      }
    }
    const response = await fetch(`https://exp.host/--/api/v2/push/${receiptMode ? 'getReceipts' : 'send'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(receiptMode ? { ids: [job.ticketId] } : [job.message]), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const error = new Error(`Expo HTTP ${response.status}`);
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    const payload = await response.json();
    const result = receiptMode ? payload?.data?.[job.ticketId] : payload?.data?.[0];
    if (result?.status === 'ok') {
      if (receiptMode) patch.state = 'delivered'; // Provider acceptance, not proof of display on a phone.
      else if (result.id) Object.assign(patch, { state: 'receipt', ticketId: result.id, nextAt: new Date(Date.now() + 900_000) });
      else throw new Error('Missing Expo ticket');
    } else if (receiptMode && !result && !payload?.errors?.length) {
      Object.assign(patch, { state: attempt < 24 ? 'receipt' : 'failed', lastError: 'ReceiptPending', nextAt: new Date(Date.now() + 1800_000) });
    } else {
      const code = result?.details?.error || payload?.errors?.[0]?.code || 'InvalidExpoResponse';
      if (code === 'DeviceNotRegistered') await DevicePushToken.updateOne({ token: job.token, userId: job.userId }, { $set: { active: false } });
      Object.assign(patch, { lastError: code, state: retryablePushError(code) && (job.attempts || 0) < 8 && job.expiresAt > new Date() ? 'queued' : 'failed', nextAt: new Date(Date.now() + retryDelay(attempt)) });
    }
  } catch (error) {
    Object.assign(patch, { lastError: error.retryable === false ? error.message : 'Expo temporarily unavailable',
      state: error.retryable === false || attempt >= (receiptMode ? 24 : 8) ? 'failed' : job.state,
      nextAt: new Date(Date.now() + retryDelay(attempt)) });
  }
  await PushDelivery.updateOne({ _id: job._id, lockedUntil: job.lockedUntil }, { $set: patch });
}

let running = false;
export async function drainPushQueue() {
  if (running) return;
  running = true;
  try {
    for (let count = 0; count < 20; count++) {
      const now = new Date();
      const job = await PushDelivery.findOneAndUpdate({ state: { $in: ['queued', 'receipt'] }, nextAt: { $lte: now }, lockedUntil: { $lte: now } },
        { $set: { lockedUntil: new Date(Date.now() + 60_000) } }, { sort: { nextAt: 1 }, new: true }).lean();
      if (!job) break;
      await processPushDelivery(job);
    }
  } finally { running = false; }
}

export function startPushDeliveryWorker() {
  const run = () => void drainPushQueue().catch(() => console.warn('Push queue failed; retrying on next tick.'));
  const timer = setInterval(run, 5000);
  timer.unref();
  run();
  return () => clearInterval(timer);
}
