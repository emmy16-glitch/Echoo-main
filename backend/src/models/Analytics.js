import mongoose from 'mongoose';

const analyticsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      index: true,
    },
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Broadcast',
      index: true,
    },
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'broadcast'],
      default: 'daily',
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    metrics: {
      listeners: { type: Number, default: 0 },
      plays: { type: Number, default: 0 },
      followers: { type: Number, default: 0 },
      engagement: { type: Number, default: 0 },
      totalListeners: { type: Number, default: 0 },
      totalPlays: { type: Number, default: 0 },
      totalFollowers: { type: Number, default: 0 },
      avgListenDuration: { type: Number, default: 0 },
      peakListeners: { type: Number, default: 0 },
      returningListeners: { type: Number, default: 0 },
      newListeners: { type: Number, default: 0 },
      uniqueListeners: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
    },
    previousPeriod: {
      listeners: { type: Number, default: 0 },
      plays: { type: Number, default: 0 },
      followers: { type: Number, default: 0 },
      engagement: { type: Number, default: 0 },
    },
    demographics: {
      topLocations: [{
        city: String,
        country: String,
        count: Number,
        percentage: Number,
      }],
      ageRanges: [{
        range: String,
        count: Number,
        percentage: Number,
      }],
      segments: [{
        name: String,
        count: Number,
        percentage: Number,
      }],
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

// Compound index for efficient queries
analyticsSchema.index({ userId: 1, date: -1, type: 1 });
analyticsSchema.index({ stationId: 1, date: -1 });

const Analytics = mongoose.model('Analytics', analyticsSchema, 'echoo_analytics');
export default Analytics;
