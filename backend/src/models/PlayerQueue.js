import mongoose from 'mongoose';

const playerQueueSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: 'Queue',
    },
    tracks: [{
      trackId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Audio',
        required: true,
      },
      addedAt: {
        type: Date,
        default: Date.now,
      },
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    }],
    currentIndex: {
      type: Number,
      default: 0,
    },
    shuffle: {
      type: Boolean,
      default: false,
    },
    repeatMode: {
      type: String,
      enum: ['none', 'one', 'all'],
      default: 'none',
    },
    isActive: {
      type: Boolean,
      default: true,
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

const PlayerQueue = mongoose.model('PlayerQueue', playerQueueSchema, 'echoo_player_queues');
export default PlayerQueue;
