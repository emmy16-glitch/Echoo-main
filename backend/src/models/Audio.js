import mongoose from 'mongoose';
import { buildAudioStreamUrl } from '../services/audioStreamAccess.js';

export const ECHOO_AUDIO_GENRES = [
  'Pop',
  'Rock',
  'Hip-Hop',
  'Electronic',
  'Jazz',
  'Classical',
  'R&B',
  'Country',
  'Metal',
  'Reggae',
  'Podcast',
  'Spiritual',
  'Educational',
  'Comedy',
  'Storytelling',
  'Other',
];

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
    sourceBroadcast: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Broadcast',
      default: null,
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
      get() {
        // Public API surfaces never receive the permanent local-storage path.
        // Public tracks get a scoped, expiring playback URL; private tracks
        // deliberately return null unless an authenticated creator controller
        // explicitly issues an owner-scoped stream URL.
        return buildAudioStreamUrl(this, { access: 'public' })?.url || null;
      },
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
    coverArtMode: {
      type: String,
      enum: ['uploaded', 'generated'],
      default: 'generated',
    },
    coverArtVariant: {
      type: Number,
      default: 0,
      min: 0,
    },
    genre: {
      type: String,
      enum: ECHOO_AUDIO_GENRES,
      default: 'Other',
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
      default: false,
      index: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'followers', 'private'],
      default: 'private',
      index: true,
    },
    publicationStatus: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    publishedAt: { type: Date, default: null },
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
      getters: true,
      transform(doc, ret) {
        delete ret.__v;
        ret.id = ret._id;
        delete ret._id;
        // Physical storage identifiers are backend-only. Playback is always
        // through /api/audio/:id/stream.
        delete ret.filename;
        delete ret.fileKey;
        return ret;
      },
    },
  }
);

audioSchema.index({ artist: 1, createdAt: -1 });
audioSchema.index({ title: 'text', description: 'text', tags: 'text' });
audioSchema.index({ isPublic: 1, createdAt: -1 });
audioSchema.index({ publicationStatus: 1, visibility: 1, createdAt: -1 });
audioSchema.index({ playCount: -1 });
audioSchema.index(
  { sourceBroadcast: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceBroadcast: { $type: 'objectId' },
      isDeleted: false,
    },
  }
);

audioSchema.virtual('fileSizeMB').get(function fileSizeMB() {
  return (this.fileSize / (1024 * 1024)).toFixed(2);
});

// Atomic increments keep analytics correct when many listeners act at the same
// moment. Read-modify-save can silently lose concurrent updates.
audioSchema.methods.incrementPlays = async function incrementPlays() {
  const updated = await this.constructor.findOneAndUpdate(
    { _id: this._id, isDeleted: false },
    { $inc: { playCount: 1 } },
    { returnDocument: 'after' }
  );
  if (updated) this.playCount = updated.playCount;
  return updated || this;
};

audioSchema.methods.incrementLikes = async function incrementLikes() {
  const updated = await this.constructor.findOneAndUpdate(
    { _id: this._id, isDeleted: false },
    { $inc: { likeCount: 1 } },
    { returnDocument: 'after' }
  );
  if (updated) this.likeCount = updated.likeCount;
  return updated || this;
};

audioSchema.methods.decrementLikes = async function decrementLikes() {
  const updated = await this.constructor.findOneAndUpdate(
    { _id: this._id, isDeleted: false, likeCount: { $gt: 0 } },
    { $inc: { likeCount: -1 } },
    { returnDocument: 'after' }
  );
  if (updated) this.likeCount = updated.likeCount;
  return updated || this;
};

// Comment controllers historically called these methods even though they were
// missing from the model, which meant a comment could be saved/deleted and the
// HTTP request would still fail afterward. Keep the denormalized counter atomic
// and never allow it to move below zero.
audioSchema.methods.incrementComments = async function incrementComments() {
  const updated = await this.constructor.findOneAndUpdate(
    { _id: this._id, isDeleted: false },
    { $inc: { commentCount: 1 } },
    { returnDocument: 'after' }
  );
  if (updated) this.commentCount = updated.commentCount;
  return updated || this;
};

audioSchema.methods.decrementComments = async function decrementComments() {
  const updated = await this.constructor.findOneAndUpdate(
    { _id: this._id, isDeleted: false, commentCount: { $gt: 0 } },
    { $inc: { commentCount: -1 } },
    { returnDocument: 'after' }
  );
  if (updated) this.commentCount = updated.commentCount;
  return updated || this;
};

const Audio = mongoose.model('Audio', audioSchema, 'echoo_audios');
export default Audio;
