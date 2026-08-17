import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'new_follower',
        'new_release',
        'new_comment',
        'new_like',
        'broadcast_live',
        'broadcast_reminder',
        'broadcast_ended',
        'tip_received',
        'tip_sent',
        'achievement_unlocked',
        'system_announcement',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: true,
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    icon: {
      type: String,
      default: null,
    },
    link: {
      type: String,
      default: null,
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

// Indexes
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ type: 1 });

const Notification = mongoose.model('Notification', notificationSchema, 'echoo_notifications');
export default Notification;
