import mongoose from 'mongoose';
import Follow from './Follow.js';
import StationFollow from './StationFollow.js';
import Notification from './Notification.js';
import Analytics from './Analytics.js';
import User from './User.js';

const broadcastSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Broadcast title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      required: true,
      index: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
      index: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        'draft',
        'scheduled',
        'starting',
        'live',
        'ending',
        'completed',
        'cancelled',
        'failed',
      ],
      default: 'draft',
      index: true,
    },
    type: {
      type: String,
      enum: ['live', 'recorded', 'recurring', 'special'],
      default: 'live',
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrencePattern: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly'],
    },
    recurrenceDays: [
      {
        type: String,
        enum: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
      },
    ],
    parentBroadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Broadcast',
    },
    coverArt: {
      type: String,
      default: null,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [30, 'Tag cannot exceed 30 characters'],
      },
    ],
    isPublic: {
      type: Boolean,
      default: true,
      index: true,
    },
    listenerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    peakListeners: {
      type: Number,
      default: 0,
      min: 0,
    },
    recordingUrl: {
      type: String,
      default: null,
    },
    streamKey: {
      type: String,
      select: false,
      default: null,
    },
    livekitRoomName: {
      type: String,
      default: null,
    },
    livekitEgressId: {
      type: String,
      default: null,
    },
    livekitIngressId: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default: '',
    },
    reminders: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        setAt: {
          type: Date,
          default: Date.now,
        },
        minutesBefore: {
          type: Number,
          default: 15,
        },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.streamKey;
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

broadcastSchema.index({ station: 1, startTime: -1 });
broadcastSchema.index({ creator: 1, startTime: -1 });
broadcastSchema.index({ status: 1, startTime: 1 });
broadcastSchema.index({ startTime: 1, endTime: 1 });

broadcastSchema.pre('save', function prepareBroadcastSideEffects() {
  if (this.startTime && this.endTime) {
    this.duration = Math.max(
      0,
      Math.round((this.endTime - this.startTime) / (1000 * 60))
    );
  }

  this.$locals.justWentLive =
    !this.isNew && this.isModified('status') && this.status === 'live';
  this.$locals.justCompleted =
    !this.isNew && this.isModified('status') && this.status === 'completed';
});

broadcastSchema.post('save', async function persistBroadcastSideEffects(doc) {
  try {
    if (doc.$locals.justWentLive && doc.isPublic) {
      const [creatorFollows, stationFollows] = await Promise.all([
        Follow.find({
          following: doc.creator,
          status: 'accepted',
        }).select('follower'),
        StationFollow.find({ station: doc.station }).select('follower'),
      ]);

      const recipientIds = new Set([
        ...creatorFollows.map((item) => String(item.follower)),
        ...stationFollows.map((item) => String(item.follower)),
      ]);
      recipientIds.delete(String(doc.creator));

      if (recipientIds.size > 0) {
        const recipients = await User.find({
          _id: { $in: [...recipientIds] },
          isActive: true,
          'preferences.notifications.newReleases': { $ne: false },
        }).select('_id');

        if (recipients.length > 0) {
          await Notification.insertMany(
            recipients.map((recipient) => ({
              userId: recipient._id,
              type: 'broadcast_live',
              title: 'A broadcast you follow is live',
              message: `${doc.title} is live now on Echoo.`,
              link: `/listen/live/${doc._id}`,
              metadata: {
                broadcastId: String(doc._id),
                stationId: String(doc.station),
                creatorId: String(doc.creator),
              },
            })),
            { ordered: false }
          ).catch((error) => {
            console.warn('Broadcast live notification warning:', error?.message || error);
          });
        }
      }
    }

    if (doc.$locals.justCompleted) {
      await Analytics.findOneAndUpdate(
        {
          broadcastId: doc._id,
          type: 'broadcast',
        },
        {
          $set: {
            userId: doc.creator,
            stationId: doc.station,
            broadcastId: doc._id,
            type: 'broadcast',
            date: doc.endedAt || new Date(),
            'metrics.listeners': Number(doc.peakListeners) || 0,
            'metrics.totalListeners': Number(doc.peakListeners) || 0,
            'metrics.peakListeners': Number(doc.peakListeners) || 0,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );
    }
  } catch (error) {
    console.warn('Broadcast side-effect warning:', error?.message || error);
  }
});

broadcastSchema.methods.isLive = function isLive() {
  return this.status === 'live';
};

broadcastSchema.methods.isUpcoming = function isUpcoming() {
  return this.status === 'scheduled' && this.startTime > new Date();
};

broadcastSchema.methods.isPast = function isPast() {
  return this.status === 'completed' || this.status === 'cancelled';
};

broadcastSchema.methods.incrementListeners = async function incrementListeners() {
  this.listenerCount = Number(this.listenerCount || 0) + 1;

  if (this.listenerCount > Number(this.peakListeners || 0)) {
    this.peakListeners = this.listenerCount;
  }

  return this.save();
};

broadcastSchema.methods.decrementListeners = async function decrementListeners() {
  if (this.listenerCount > 0) {
    this.listenerCount -= 1;
    return this.save();
  }
  return this;
};

const Broadcast = mongoose.model('Broadcast', broadcastSchema, 'echoo_broadcasts');
export default Broadcast;
