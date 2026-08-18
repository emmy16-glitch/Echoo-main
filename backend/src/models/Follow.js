import mongoose from 'mongoose';
import Notification from './Notification.js';
import User from './User.js';

const followSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'blocked'],
      default: 'accepted',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

followSchema.index(
  { follower: 1, following: 1 },
  { unique: true }
);
followSchema.index({ follower: 1, status: 1, createdAt: -1 });
followSchema.index({ following: 1, status: 1, createdAt: -1 });

followSchema.pre('save', function rememberNewAcceptedFollow() {
  this.$locals.notifyNewFollower = this.isNew && this.status === 'accepted';
});

followSchema.post('save', async function notifyFollowedUser(doc) {
  if (!doc.$locals.notifyNewFollower) return;

  try {
    const [follower, recipient] = await Promise.all([
      User.findById(doc.follower).select('username displayName'),
      User.findById(doc.following).select(
        'isActive preferences.notifications.newFollowers'
      ),
    ]);

    if (
      !recipient?.isActive ||
      recipient.preferences?.notifications?.newFollowers === false
    ) {
      return;
    }

    await Notification.create({
      userId: doc.following,
      type: 'new_follower',
      title: 'New follower',
      message: `${follower?.displayName || follower?.username || 'Someone'} started following you on Echoo.`,
      metadata: {
        followerId: String(doc.follower),
      },
    });
  } catch (error) {
    console.warn('New follower notification warning:', error?.message || error);
  }
});

const Follow = mongoose.model('Follow', followSchema, 'echoo_follows');
export default Follow;
