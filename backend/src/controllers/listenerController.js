import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';

const creatorSummary =
  '_id username displayName avatar bio userType creatorProfile.category creatorProfile.artistName creatorProfile.organizationName creatorProfile.organizationLogo creatorProfile.isVerified';

const stationPublicFields =
  'name slug description coverArt branding category tags isLive listenerCount totalListeners followerCount isPublic updatedAt';

const CATEGORY_GENRES = {
  'Faith & Spirituality': ['Spiritual', 'Podcast'],
  Education: ['Educational', 'Podcast'],
  'News & Politics': ['Podcast'],
  Business: ['Podcast'],
  'Health & Wellness': ['Podcast'],
  Entertainment: ['Comedy', 'Storytelling'],
  Technology: ['Podcast'],
  Sports: ['Podcast'],
  Music: ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'R&B', 'Country', 'Metal', 'Reggae'],
  Comedy: ['Comedy'],
  Storytelling: ['Storytelling'],
  Other: ['Other'],
};

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function realCreatorIds() {
  return User.distinct('_id', {
    userType: 'creator',
    isActive: true,
  });
}

async function getContinueListening(userId) {
  const user = await User.findById(userId).populate({
    path: 'continueListening.trackId',
    select: 'title description duration artist fileUrl coverArt coverArtMode coverArtVariant genre playCount likeCount',
    populate: {
      path: 'artist',
      select: creatorSummary,
    },
  });

  if (!user?.continueListening?.length) return [];

  return user.continueListening
    .map((item) => {
      const track = item.trackId;
      if (!track) return null;
      return {
        ...track.toJSON(),
        progress: Number(item.progress) || 0,
        remaining: Number(item.remaining) || 0,
        lastPlayed: item.lastPlayed || null,
      };
    })
    .filter(Boolean);
}

async function getRecommendedTracks(user) {
  const preferredCategories = Array.isArray(user?.preferences?.categories)
    ? user.preferences.categories
    : [];

  const preferredGenres = unique(
    preferredCategories.flatMap((category) => CATEGORY_GENRES[category] || [])
  );

  // Listener discovery is creator content only. Old development/admin uploads
  // can stay in the database for diagnostics without leaking into public feeds.
  const creatorIds = await realCreatorIds();
  const filter = {
    isPublic: true,
    isDeleted: false,
    artist: { $in: creatorIds },
  };

  if (preferredGenres.length) filter.genre = { $in: preferredGenres };

  let tracks = await Audio.find(filter)
    .populate('artist', creatorSummary)
    .sort({ playCount: -1, createdAt: -1 })
    .limit(12);

  if (!tracks.length && preferredGenres.length) {
    tracks = await Audio.find({
      isPublic: true,
      isDeleted: false,
      artist: { $in: creatorIds },
    })
      .populate('artist', creatorSummary)
      .sort({ createdAt: -1 })
      .limit(12);
  }

  return tracks;
}

async function getLiveNow() {
  return Broadcast.find({
    status: 'live',
    isDeleted: false,
    isPublic: true,
  })
    .populate('station', stationPublicFields)
    .populate('creator', creatorSummary)
    .sort({ startedAt: -1 })
    .limit(12);
}

async function getUpcoming() {
  return Broadcast.find({
    status: 'scheduled',
    isDeleted: false,
    isPublic: true,
    startTime: { $gte: new Date() },
  })
    .populate('station', stationPublicFields)
    .populate('creator', creatorSummary)
    .sort({ startTime: 1 })
    .limit(12);
}

async function getDiscoverStations() {
  return Station.find({
    isDeleted: false,
    isPublic: true,
  })
    .populate('owner', creatorSummary)
    .sort({ isLive: -1, followerCount: -1, createdAt: -1 })
    .limit(12);
}

async function getDiscoverCreators() {
  return User.find({
    isActive: true,
    userType: 'creator',
  })
    .select(creatorSummary)
    .sort({ createdAt: -1 })
    .limit(12);
}

async function getRecentActivity(userId) {
  const user = await User.findById(userId).populate({
    path: 'listeningHistory.trackId',
    select: 'title duration artist fileUrl coverArt coverArtMode coverArtVariant genre',
    populate: {
      path: 'artist',
      select: creatorSummary,
    },
  });

  if (!user?.listeningHistory?.length) return [];

  return user.listeningHistory
    .slice(-10)
    .reverse()
    .map((entry) => {
      if (!entry.trackId) return null;
      return {
        track: entry.trackId,
        playedAt: entry.playedAt,
        progress: Number(entry.progress) || 0,
        completed: Boolean(entry.completed),
      };
    })
    .filter(Boolean);
}

export async function getListenerDashboard(req, res, next) {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const [
      continueListening,
      recommendedTracks,
      liveNow,
      upcoming,
      discoverStations,
      discoverCreators,
      recentActivity,
      totalTracks,
    ] = await Promise.all([
      getContinueListening(req.userId),
      getRecommendedTracks(user),
      getLiveNow(),
      getUpcoming(),
      getDiscoverStations(),
      getDiscoverCreators(),
      getRecentActivity(req.userId),
      Audio.countDocuments({ isPublic: true, isDeleted: false }),
    ]);

    return res.status(200).json({
      data: {
        greeting: `${greetingForNow()}, ${user.displayName || user.username}`,
        continueListening,
        recommendedTracks,
        liveNow,
        upcoming,
        discoverStations,
        discoverCreators,
        totalTracks,
        recentActivity,
        topCategories: Object.keys(CATEGORY_GENRES),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    next(error);
  }
}
