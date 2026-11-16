import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  broadcastId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  token: { type: String, required: true }, message: mongoose.Schema.Types.Mixed,
  state: { type: String, default: 'queued', enum: ['queued', 'receipt', 'delivered', 'failed', 'cancelled'] },
  attempts: { type: Number, default: 0 }, receiptAttempts: { type: Number, default: 0 },
  ticketId: String, lastError: String,
  nextAt: { type: Date, default: Date.now }, lockedUntil: { type: Date, default: () => new Date(0) },
  expiresAt: Date, purgeAt: Date,
}, { timestamps: true });
schema.index({ broadcastId: 1, userId: 1, token: 1 }, { unique: true });
schema.index({ state: 1, nextAt: 1, lockedUntil: 1 });
schema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('PushDelivery', schema);
