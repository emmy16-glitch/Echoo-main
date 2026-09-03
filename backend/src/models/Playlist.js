import mongoose from 'mongoose';

const playlistSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Playlist name is required'],
      trim: true,
      maxlength: [100, 'Playlist name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    mode: {
      type: String,
      enum: ['playlist', 'series'],
      default: 'playlist',
      index: true,
    },
    seasons: [
      {
        _id: false,
        id: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
          trim: true,
          maxlength: 100,
        },
        trackIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Audio',
          },
        ],
      },
    ],
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // `series` rows are surfaced as Creator Collections. Keeping this optional
    // preserves existing listener playlists while giving creator collections a
    // canonical Channel home.
    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Station',
      default: null,
      index: true,
    },
    tracks: [
      {
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
          required: true,
        },
      },
    ],
    coverArt: {
      type: String,
      default: null,
    },
    isPublic: {
      type: Boolean,
      default: true,
      index: true,
    },
    isCollaborative: {
      type: Boolean,
      default: false,
    },
    collaborators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    trackCount: {
      type: Number,
      default: 0,
    },
    followerCount: {
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

playlistSchema.index({ owner: 1, createdAt: -1 });
playlistSchema.index({ station: 1, mode: 1, isPublic: 1, updatedAt: -1 });
playlistSchema.index({ isPublic: 1, createdAt: -1 });
playlistSchema.index({ name: 'text', description: 'text' });

const objectIdString = (value) =>
  String(value?._id || value?.id || value || '');

playlistSchema.methods.canEdit = function canEdit(userId) {
  if (!userId) return false;
  const userIdStr = objectIdString(userId);
  if (objectIdString(this.owner) === userIdStr) return true;
  return Boolean(
    this.isCollaborative &&
    this.collaborators.some((id) => objectIdString(id) === userIdStr)
  );
};

playlistSchema.methods.addTrack = async function addTrack(trackId, userId) {
  const trackKey = objectIdString(trackId);
  const exists = this.tracks.some((entry) => objectIdString(entry.trackId) === trackKey);
  if (exists) {
    const error = new Error('Track already in playlist');
    error.status = 409;
    error.code = 'TRACK_ALREADY_IN_PLAYLIST';
    throw error;
  }

  this.tracks.push({ trackId, addedBy: userId });
  this.trackCount = this.tracks.length;
  return this.save();
};

playlistSchema.methods.removeTrack = async function removeTrack(trackId) {
  const trackKey = objectIdString(trackId);
  this.tracks = this.tracks.filter(
    (entry) => objectIdString(entry.trackId) !== trackKey
  );
  this.trackCount = this.tracks.length;
  return this.save();
};

playlistSchema.methods.reorderTracks = async function reorderTracks(trackIds) {
  if (!Array.isArray(trackIds) || trackIds.length !== this.tracks.length) {
    const error = new Error('Track count mismatch');
    error.status = 400;
    error.code = 'PLAYLIST_TRACK_MISMATCH';
    throw error;
  }

  const requestedIds = trackIds.map(objectIdString);
  const existingIds = this.tracks.map((entry) => objectIdString(entry.trackId));

  // `find()`-based ordering used to allow [A, A] to replace [A, B] because the
  // resulting array still had the same length. Require an exact unique set.
  if (
    requestedIds.some((id) => !id) ||
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some((id) => !existingIds.includes(id)) ||
    existingIds.some((id) => !requestedIds.includes(id))
  ) {
    const error = new Error('trackIds must contain every playlist track exactly once');
    error.status = 400;
    error.code = 'INVALID_PLAYLIST_ORDER';
    throw error;
  }

  const byId = new Map(
    this.tracks.map((entry) => [objectIdString(entry.trackId), entry])
  );
  this.tracks = requestedIds.map((id) => byId.get(id));
  this.trackCount = this.tracks.length;
  return this.save();
};

const Playlist = mongoose.model('Playlist', playlistSchema, 'echoo_playlists');
export default Playlist;
