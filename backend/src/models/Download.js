import mongoose from 'mongoose';

const downloadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    trackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Audio',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'downloading', 'completed', 'failed', 'paused'],
      default: 'pending',
    },
    progress: {
      type: Number,
      default: 0,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    downloadedSize: {
      type: Number,
      default: 0,
    },
    filePath: {
      type: String,
      default: null,
    },
    quality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
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
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

// Compound index to prevent duplicate downloads
downloadSchema.index({ userId: 1, trackId: 1 }, { unique: true });

const Download = mongoose.model('Download', downloadSchema, 'echoo_downloads');
export default Download;
