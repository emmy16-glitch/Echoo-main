import mongoose from 'mongoose';

const devicePushTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true, trim: true, maxlength: 255 },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    active: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

devicePushTokenSchema.index({ userId: 1, active: 1, lastSeenAt: -1 });

export default mongoose.model('DevicePushToken', devicePushTokenSchema, 'echoo_device_push_tokens');
