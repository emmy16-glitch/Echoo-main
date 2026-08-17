import mongoose from 'mongoose';

const stationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Station name is required'],
      trim: true,
      maxlength: [100, 'Station name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    coverArt: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      enum: [
        'Faith & Spirituality',
        'Education',
        'News & Politics',
        'Business',
        'Health & Wellness',
        'Entertainment',
        'Technology',
        'Sports',
        'Music',
        'Comedy',
        'Storytelling',
        'Other',
      ],
      default: 'Other',
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [30, 'Tag cannot exceed 30 characters'],
      },
    ],

    // Derived runtime state. Broadcast lifecycle code is the only writer.
    isLive: {
      type: Boolean,
      default: false,
      index: true,
    },
    listenerCount: {
      type: Number,
      default: 0,
    },
    totalListeners: {
      type: Number,
      default: 0,
    },

    isPublic: {
      type: Boolean,
      default: true,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    followerCount: {
      type: Number,
      default: 0,
    },

    // Retained for future distribution compatibility; not used as live authority.
    streamUrl: {
      type: String,
      default: null,
    },
    streamKey: {
      type: String,
      select: false,
    },
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

stationSchema.index({ slug: 1 }, { unique: true });
stationSchema.index({ owner: 1, createdAt: -1 });
stationSchema.index({ isPublic: 1, isLive: 1 });
stationSchema.index({ name: 'text', description: 'text', tags: 'text' });
stationSchema.index({ category: 1 });
stationSchema.index({ isFeatured: 1 });

stationSchema.methods.incrementListeners = async function incrementListeners() {
  this.listenerCount += 1;
  this.totalListeners += 1;
  return this.save();
};

stationSchema.methods.decrementListeners = async function decrementListeners() {
  if (this.listenerCount > 0) {
    this.listenerCount -= 1;
    return this.save();
  }
  return this;
};

const Station = mongoose.model('Station', stationSchema, 'echoo_stations');
export default Station;
