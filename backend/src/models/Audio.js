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
        // Never expose the permanent local-storage path. A bearer-free media
        // URL exists only for canonically public + published audio; followers,
        // private and draft assets must obtain an account-bound URL instead.
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

// `isPublic` remains for compatibility with older clients/indexes, but it must
// never become an independent authorization switch. Any query explicitly asking
// for public audio is tightened to the canonical publication fields as well.
const enforceCanonicalPublicQuery = function enforceCanonicalPublicQuery() {
  const filter = this.getFilter?.() || {};
  if (filter.isPublic !== true) return;
  if (filter.visibility === undefined) this.where({ visibility: 'public' });
  if (filter.publicationStatus === undefined) this.where({ publicationStatus: 'published' });
};

audioSchema.pre(/^find/, enforceCanonicalPublicQuery);
audioSchema.pre('countDocuments', enforceCanonicalPublicQuery);

// Keep future document saves internally consistent. Followers-only/private
// published replay assets deliberately use isPublic=false and are unaffected.
audioSchema.pre('save', function keepPublicationFieldsAligned() {
  if (this.isPublic === true) {
    this.visibility = 'public';
    this.publicationStatus = 'published';
    this.publishedAt = this.publishedAt || new Date();
  } else if (this.visibility === 'public') {
    this.visibility = 'private';
  }
});

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
