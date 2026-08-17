import mongoose from 'mongoose';

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

        // Live startup lifecycle
        'starting',

        'live',

        // Live shutdown lifecycle
        'ending',

        'completed',
        'cancelled',

        // Media infrastructure failure
        'failed',
      ],

      default: 'draft',
      index: true,
    },

    type: {
      type: String,
      enum: [
        'live',
        'recorded',
        'recurring',
        'special',
      ],
      default: 'live',
    },

    isRecurring: {
      type: Boolean,
      default: false,
    },

    recurrencePattern: {
      type: String,
      enum: [
        'daily',
        'weekly',
        'biweekly',
        'monthly',
      ],
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

    /*
     * ==========================================================
     * LIVEKIT / OVENMEDIAENGINE STATE
     * ==========================================================
     */

    livekitRoomName: {
      type: String,
      default: null,
    },

    livekitEgressId: {
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

    /*
     * ==========================================================
     */

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


/*
 * ==========================================================
 * INDEXES
 * ==========================================================
 */

broadcastSchema.index({
  station: 1,
  startTime: -1,
});

broadcastSchema.index({
  creator: 1,
  startTime: -1,
});

broadcastSchema.index({
  status: 1,
  startTime: 1,
});

broadcastSchema.index({
  startTime: 1,
  endTime: 1,
});


/*
 * ==========================================================
 * MIDDLEWARE
 * ==========================================================
 */

broadcastSchema.pre('save', function () {
  if (this.startTime && this.endTime) {
    this.duration = Math.max(
      0,
      Math.round(
        (this.endTime - this.startTime) /
        (1000 * 60)
      )
    );
  }
});


/*
 * ==========================================================
 * INSTANCE METHODS
 * ==========================================================
 */

broadcastSchema.methods.isLive = function () {
  const now = new Date();

  return (
    this.status === 'live' ||
    (
      this.status === 'scheduled' &&
      this.startTime <= now &&
      this.endTime >= now
    )
  );
};


broadcastSchema.methods.isUpcoming = function () {
  return (
    this.status === 'scheduled' &&
    this.startTime > new Date()
  );
};


broadcastSchema.methods.isPast = function () {
  return (
    this.status === 'completed' ||
    (
      this.endTime &&
      this.endTime < new Date()
    )
  );
};


broadcastSchema.methods.incrementListeners =
  async function () {

    this.listenerCount =
      Number(this.listenerCount || 0) + 1;

    if (
      this.listenerCount >
      Number(this.peakListeners || 0)
    ) {
      this.peakListeners =
        this.listenerCount;
    }

    return this.save();
  };


broadcastSchema.methods.decrementListeners =
  async function () {

    if (this.listenerCount > 0) {
      this.listenerCount -= 1;
      return this.save();
    }

    return this;
  };


const Broadcast = mongoose.model(
  'Broadcast',
  broadcastSchema,
  'echoo_broadcasts'
);

export default Broadcast;
