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
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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

// Indexes
playlistSchema.index({ owner: 1, createdAt: -1 });
playlistSchema.index({ isPublic: 1, createdAt: -1 });
playlistSchema.index({ name: 'text', description: 'text' });

// Instance methods
playlistSchema.methods.canEdit = function(userId) {
  if (!userId) return false;
  const userIdStr = userId.toString();
  if (this.owner.toString() === userIdStr) return true;
  if (this.isCollaborative && this.collaborators.some(id => id.toString() === userIdStr)) {
    return true;
  }
  return false;
};

playlistSchema.methods.addTrack = async function(trackId, userId) {
  const exists = this.tracks.some(t => t.trackId.toString() === trackId.toString());
  if (exists) {
    throw new Error('Track already in playlist');
  }

  this.tracks.push({
    trackId,
    addedBy: userId,
  });

  this.trackCount = this.tracks.length;
  return await this.save();
};

playlistSchema.methods.removeTrack = async function(trackId) {
  this.tracks = this.tracks.filter(t => t.trackId.toString() !== trackId.toString());
  this.trackCount = this.tracks.length;
  return await this.save();
};

playlistSchema.methods.reorderTracks = async function(trackIds) {
  if (trackIds.length !== this.tracks.length) {
    throw new Error('Track count mismatch');
  }

  const orderedTracks = trackIds.map(id =>
    this.tracks.find(t => t.trackId.toString() === id.toString())
  ).filter(Boolean);

  if (orderedTracks.length !== this.tracks.length) {
    throw new Error('Some tracks not found in playlist');
  }

  this.tracks = orderedTracks;
  return await this.save();
};

const Playlist = mongoose.model('Playlist', playlistSchema, 'echoo_playlists');
export default Playlist;
