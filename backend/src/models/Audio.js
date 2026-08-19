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
audioSchema.index({ playCount: -1 });

audioSchema.virtual('fileSizeMB').get(function fileSizeMB() {
  return (this.fileSize / (1024 * 1024)).toFixed(2);
});

// Atomic increments keep analytics correct when many listeners begin playback
// at the same moment. Read-modify-save can silently lose concurrent updates.
audioSchema.methods.incrementPlays = async function incrementPlays() {
  const updated = await this.constructor.findOneAndUpdate(
    { _id: this._id, isDeleted: false },
    { $inc: { playCount: 1 } },
    { new: true }
  );
  if (updated) this.playCount = updated.playCount;
  return updated || this;
};

audioSchema.methods.incrementLikes = async function incrementLikes() {
  const updated = await this.constructor.findOneAndUpdate(
    { _id: this._id, isDeleted: false },
    { $inc: { likeCount: 1 } },
    { new: true }
  );
  if (updated) this.likeCount = updated.likeCount;
  return updated || this;
};

audioSchema.methods.decrementLikes = async function decrementLikes() {
  const updated = await this.constructor.findOneAndUpdate(
    { _id: this._id, isDeleted: false, likeCount: { $gt: 0 } },
    { $inc: { likeCount: -1 } },
    { new: true }
  );
  if (updated) this.likeCount = updated.likeCount;
  return updated || this;
};

const Audio = mongoose.model('Audio', audioSchema, 'echoo_audios');
export default Audio;
