import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { generateAccessToken, generateRefreshToken } from '../config/jwt.js';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, 'Display name cannot exceed 50 characters'],
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default: '',
    },
    avatar: {
      type: String,
      default: null,
    },
    roles: {
      type: [String],
      enum: ['listener', 'creator', 'admin', 'moderator'],
      default: ['listener'],
    },
    userType: {
      type: String,
      enum: ['listener', 'creator'],
      default: 'listener',
    },
    creatorProfile: {
      creatorType: {
        type: String,
        enum: ['individual', 'organization'],
      },
      artistName: {
        type: String,
        trim: true,
        maxlength: [50, 'Artist name cannot exceed 50 characters'],
      },
      organizationName: {
        type: String,
        trim: true,
        maxlength: [100, 'Organization name cannot exceed 100 characters'],
      },
      organizationType: {
        type: String,
        enum: ['company', 'church', 'brand', 'community', 'organization', 'other'],
      },
      organizationLogo: {
        type: String,
        default: null,
      },
      category: {
        type: String,
        enum: ['Music', 'Podcast', 'Education', 'Entertainment', 'News', 'Sports', 'Technology', 'Spiritual', 'Comedy', 'Storytelling', 'Other'],
      },
      about: {
        type: String,
        maxlength: [2000, 'About cannot exceed 2000 characters'],
        default: '',
      },
      contentDescription: {
        type: String,
        maxlength: [2000, 'Content description cannot exceed 2000 characters'],
        default: '',
      },
      website: {
        type: String,
        trim: true,
        match: [/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/, 'Please enter a valid URL'],
      },
      location: {
        type: String,
        trim: true,
        maxlength: [100, 'Location cannot exceed 100 characters'],
      },
      genres: [{
        type: String,
        enum: ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'R&B', 'Country', 'Metal', 'Reggae', 'Podcast', 'Spiritual', 'Educational', 'Comedy', 'Storytelling', 'Other'],
      }],
      isVerified: {
        type: Boolean,
        default: false,
      },
      followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      }],
      totalListeners: {
        type: Number,
        default: 0,
      },
      totalTracks: {
        type: Number,
        default: 0,
      },
      totalPlays: {
        type: Number,
        default: 0,
      },
      joinedDate: {
        type: Date,
        default: Date.now,
      },
      isApproved: {
        type: Boolean,
        default: false,
      },
    },
    preferences: {
      language: {
        type: String,
        default: 'en',
      },
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        newFollowers: { type: Boolean, default: true },
        newReleases: { type: Boolean, default: true },
      },
      categories: [{
        type: String,
        enum: ['Faith & Spirituality', 'Education', 'News & Politics', 'Business', 'Health & Wellness', 'Entertainment', 'Technology', 'Sports', 'Music', 'Comedy', 'Storytelling', 'Other'],
      }],
      player: {
        volume: { type: Number, min: 0, max: 1, default: 1 },
        isMuted: { type: Boolean, default: false },
        hapticsEnabled: { type: Boolean, default: true },
        playbackRate: { type: Number, min: 0.5, max: 3, default: 1 },
        isShuffled: { type: Boolean, default: false },
        repeatMode: {
          type: String,
          enum: ['none', 'one', 'all'],
          default: 'none',
        },
      },
      creatorAudio: {
        audioMode: {
          type: String,
          enum: ['raw', 'enhanced'],
          default: 'enhanced',
        },
        noiseReduction: { type: Number, min: 0, max: 100, default: 45 },
        echoRemoval: { type: Boolean, default: true },
        voiceWarmth: { type: Number, min: 0, max: 100, default: 35 },
        voiceClarity: { type: Number, min: 0, max: 100, default: 45 },
        deEsser: { type: Number, min: 0, max: 100, default: 30 },
        volumeBalance: { type: Number, min: 0, max: 100, default: 45 },
        protectLoudSounds: { type: Boolean, default: true },
        masterVolume: { type: Number, min: 0, max: 100, default: 100 },
      },
      creatorTranscript: {
        language: {
          type: String,
          enum: ['en', 'yo', 'pcm', 'ha'],
          default: 'en',
        },
        showCaptions: { type: Boolean, default: true },
      },
    },
    listeningHistory: [{
      trackId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Audio',
      },
      playedAt: {
        type: Date,
        default: Date.now,
      },
      progress: {
        type: Number,
        default: 0,
      },
      completed: {
        type: Boolean,
        default: false,
      },
    }],
    continueListening: [{
      trackId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Audio',
      },
      title: String,
      progress: Number,
      remaining: Number,
      lastPlayed: Date,
    }],
    savedAudio: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Audio',
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    refreshTokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    onboardingStep: {
      type: Number,
      default: 0,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    uploadedAudio: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Audio',
    }],
    likedAudio: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Audio',
    }],
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.refreshTokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
userSchema.index({ userType: 1 });
userSchema.index({ 'creatorProfile.isVerified': 1 });
userSchema.index({ 'listeningHistory.playedAt': -1 });

// Static method to hash password
userSchema.statics.hashPassword = async function(password) {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(password, salt);
};

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Instance method to generate tokens
userSchema.methods.generateTokens = function() {
  const payload = {
    userId: this._id,
    email: this.email,
    roles: this.roles,
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({
    userId: this._id,
    tokenVersion: this.refreshTokenVersion || 0,
  });
  return { accessToken, refreshToken };
};

// Instance method to set user type
userSchema.methods.setUserType = async function(userType) {
  if (!['listener', 'creator'].includes(userType)) {
    throw new Error('Invalid user type. Must be "listener" or "creator"');
  }
  
  this.userType = userType;
  // Roles describe account capabilities, not the screen currently open. Every
  // Echoo account can listen, and Creator setup adds that capability without
  // removing the listener experience.
  this.roles = [...new Set(['listener', ...(this.roles || []), userType])];
  this.onboardingStep = userType === 'creator' ? 1 : 0;
  this.onboardingCompleted = userType === 'listener' ? true : false;
  return await this.save();
};

// Instance method to set creator type
userSchema.methods.setCreatorType = async function(creatorType, data) {
  if (this.userType !== 'creator') {
    throw new Error('User must be a creator to set creator type');
  }
  
  if (!['individual', 'organization'].includes(creatorType)) {
    throw new Error('Invalid creator type. Must be "individual" or "organization"');
  }
  
  this.creatorProfile.creatorType = creatorType;
  
  if (creatorType === 'individual') {
    this.creatorProfile.artistName = data.artistName || this.displayName;
  } else {
    this.creatorProfile.organizationName = data.organizationName;
    this.creatorProfile.organizationType = data.organizationType;
    this.creatorProfile.website = data.website;
    this.creatorProfile.location = data.location;
  }
  
  this.onboardingStep = 2;
  return await this.save();
};

// Instance method to update content info
userSchema.methods.updateContentInfo = async function(data) {
  if (this.userType !== 'creator') {
    throw new Error('User must be a creator to update content info');
  }
  
  if (data.category) this.creatorProfile.category = data.category;
  if (data.contentDescription) this.creatorProfile.contentDescription = data.contentDescription;
  if (data.genres) this.creatorProfile.genres = data.genres;
  
  this.onboardingStep = this.creatorProfile.creatorType === 'organization' ? 3 : 4;
  return await this.save();
};

// Instance method to update organization info
userSchema.methods.updateOrganizationInfo = async function(data) {
  if (this.userType !== 'creator' || this.creatorProfile.creatorType !== 'organization') {
    throw new Error('User must be an organization creator to update organization info');
  }
  
  if (data.organizationName) this.creatorProfile.organizationName = data.organizationName;
  if (data.category) this.creatorProfile.category = data.category;
  if (data.about) this.creatorProfile.about = data.about;
  if (data.contentDescription) this.creatorProfile.contentDescription = data.contentDescription;
  if (data.organizationLogo) this.creatorProfile.organizationLogo = data.organizationLogo;
  
  this.onboardingStep = 4;
  return await this.save();
};

// Instance method to complete onboarding
userSchema.methods.completeOnboarding = async function() {
  this.onboardingCompleted = true;
  this.onboardingStep = 5;
  return await this.save();
};

// Instance method to update listening history
userSchema.methods.updateListeningHistory = async function(trackId, progress) {
  const historyEntry = {
    trackId,
    playedAt: new Date(),
    progress: progress || 0,
    completed: progress >= 100,
  };
  
  this.listeningHistory.push(historyEntry);
  
  // Keep only last 100 entries
  if (this.listeningHistory.length > 100) {
    this.listeningHistory = this.listeningHistory.slice(-100);
  }
  
  return await this.save();
};

const User = mongoose.model('User', userSchema, 'echoo_users');
export default User;
