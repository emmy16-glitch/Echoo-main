import mongoose from 'mongoose';

const audioSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    artist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileKey: {
      type: String,
      required: true,
      unique: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      default: 0,
    },
    coverArt: {
      type: String,
      default: null,
    },
    genre: {
      type: String,
      enum: ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'R&B', 'Country', 'Metal', 'Reggae', 'Podcast', 'Other'],
      default: 'Other',
    },
    tags: [{
      type: String,
      trim: true,
      maxlength: [30, 'Tag cannot exceed 30 characters'],
    }],
    isPublic: {
      type: Boolean,
      default: true,
      index: true,
    },
    playCount: {
      type: Number,
      default: 0,
    },
    likeCount: {
      type: Number,
      default: 0,
    },
    commentCount: {
      type: Number,
      default: 0,
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

// Indexes
audioSchema.index({ artist: 1, createdAt: -1 });
audioSchema.index({ title: 'text', description: 'text', tags: 'text' });
audioSchema.index({ isPublic: 1, createdAt: -1 });
audioSchema.index({ playCount: -1 });

// Virtual for file size in MB
audioSchema.virtual('fileSizeMB').get(function() {
  return (this.fileSize / (1024 * 1024)).toFixed(2);
});

// Instance methods
audioSchema.methods.incrementPlays = async function() {
  this.playCount += 1;
  return await this.save();
};

audioSchema.methods.incrementLikes = async function() {
  this.likeCount += 1;
  return await this.save();
};

audioSchema.methods.decrementLikes = async function() {
  if (this.likeCount > 0) {
    this.likeCount -= 1;
    return await this.save();
  }
  return this;
};

const Audio = mongoose.model('Audio', audioSchema, 'echoo_audios');
export default Audio;
