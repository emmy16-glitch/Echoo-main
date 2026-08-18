import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Playlist from '../models/Playlist.js';
import Station from '../models/Station.js';

const safePage = (value) => Math.max(1, Number(value) || 1);
const safeLimit = (value) => Math.min(100, Math.max(1, Number(value) || 20));

const creatorAudioIds = () =>
  User.distinct('_id', {
    userType: 'creator',
    isActive: true,
  });

const trackResult = (track) => ({
  id: track._id,
  title: track.title,
  description: track.description,
  duration: track.duration,
  genre: track.genre,
  fileUrl: track.fileUrl,
  coverArt: track.coverArt || null,
  coverArtMode: track.coverArtMode || null,
  coverArtVariant: track.coverArtVariant ?? null,
  playCount: track.playCount || 0,
  likeCount: track.likeCount || 0,
  artist: track.artist
    ? {
        id: track.artist._id,
        username: track.artist.username,
        displayName: track.artist.displayName,
        avatar: track.artist.avatar,
        userType: track.artist.userType,
        artistName: track.artist.creatorProfile?.artistName,
        organizationName: track.artist.creatorProfile?.organizationName,
      }
    : null,
  createdAt: track.createdAt,
});

const creatorResult = (user) => ({
  id: user._id,
  username: user.username,
  displayName: user.displayName,
  avatar: user.avatar,
  bio: user.bio,
  userType: user.userType,
  creatorType: user.creatorProfile?.creatorType,
  artistName: user.creatorProfile?.artistName,
  organizationName: user.creatorProfile?.organizationName,
  category: user.creatorProfile?.category,
  totalListeners: user.creatorProfile?.totalListeners || 0,
  isVerified: user.creatorProfile?.isVerified || false,
});

const stationResult = (station) => ({
  id: station._id,
  name: station.name,
  slug: station.slug,
  description: station.description,
  category: station.category,
  coverArt: station.coverArt,
  branding: station.branding || null,
  listenerCount: station.listenerCount || 0,
  followerCount: station.followerCount || 0,
  isLive: Boolean(station.isLive),
  owner: station.owner
    ? {
        id: station.owner._id,
        username: station.owner.username,
        displayName: station.owner.displayName,
        avatar: station.owner.avatar,
      }
    : null,
  createdAt: station.createdAt,
});

const playlistResult = (playlist) => ({
  id: playlist._id,
  name: playlist.name,
  description: playlist.description,
  coverArt: playlist.coverArt,
  trackCount: playlist.trackCount || playlist.tracks?.length || 0,
  followerCount: playlist.followerCount || 0,
  isPublic: playlist.isPublic,
  owner: playlist.owner
    ? {
        id: playlist.owner._id,
        username: playlist.owner.username,
        displayName: playlist.owner.displayName,
        avatar: playlist.owner.avatar,
      }
    : null,
  createdAt: playlist.createdAt,
});

const requireQuery = (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Search query must be at least 2 characters',
      },
    });
    return null;
  }
  return query;
};

const regexFields = (query, fields) =>
  fields.map((field) => ({ [field]: { $regex: query, $options: 'i' } }));

export async function globalSearch(req, res, next) {
  try {
    const query = requireQuery(req, res);
    if (!query) return;

    const page = safePage(req.query.page);
    const limit = safeLimit(req.query.limit);
    const skip = (page - 1) * limit;
    const searchTypes = req.query.type
      ? String(req.query.type).split(',').map((item) => item.trim())
      : ['tracks', 'creators', 'stations', 'playlists'];
    const results = {};
    const counts = {};

    if (searchTypes.includes('tracks')) {
      const creatorIds = await creatorAudioIds();
      const filter = {
        isPublic: true,
        isDeleted: false,
        artist: { $in: creatorIds },
        $or: regexFields(query, ['title', 'description', 'tags']),
      };
      if (req.query.category) filter.genre = req.query.category;

      const [tracks, total] = await Promise.all([
        Audio.find(filter)
          .populate(
            'artist',
            'username displayName avatar userType creatorProfile.artistName creatorProfile.organizationName'
          )
          .sort({ playCount: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select(
            'title description duration genre fileUrl coverArt coverArtMode coverArtVariant playCount likeCount createdAt artist'
          ),
        Audio.countDocuments(filter),
      ]);
      results.tracks = tracks.map(trackResult);
      counts.tracks = total;
    }

    if (searchTypes.includes('creators')) {
      const filter = {
        userType: 'creator',
        isActive: true,
        onboardingCompleted: true,
        $or: regexFields(query, [
          'username',
          'displayName',
          'creatorProfile.artistName',
          'creatorProfile.organizationName',
          'creatorProfile.about',
        ]),
      };

      const [creators, total] = await Promise.all([
        User.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('username displayName avatar bio creatorProfile userType createdAt'),
        User.countDocuments(filter),
      ]);
      results.creators = creators.map(creatorResult);
      counts.creators = total;
    }

    if (searchTypes.includes('stations')) {
      const filter = {
        isPublic: true,
        isDeleted: false,
        $or: regexFields(query, ['name', 'description', 'tags', 'category']),
      };

      const [stations, total] = await Promise.all([
        Station.find(filter)
          .populate('owner', 'username displayName avatar')
          .sort({ isLive: -1, listenerCount: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Station.countDocuments(filter),
      ]);
      results.stations = stations.map(stationResult);
      counts.stations = total;
    }

    if (searchTypes.includes('playlists')) {
      const filter = {
        isPublic: true,
        isDeleted: false,
        $or: regexFields(query, ['name', 'description']),
      };

      const [playlists, total] = await Promise.all([
        Playlist.find(filter)
          .populate('owner', 'username displayName avatar')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Playlist.countDocuments(filter),
      ]);
      results.playlists = playlists.map(playlistResult);
      counts.playlists = total;
    }

    const suggestions = [];
    for (const track of results.tracks || []) {
      suggestions.push({ type: 'track', label: track.title, value: track.title });
    }
    for (const creator of results.creators || []) {
      const label = creator.displayName || creator.username;
      suggestions.push({ type: 'creator', label, value: label });
    }
    for (const station of results.stations || []) {
      suggestions.push({ type: 'station', label: station.name, value: station.name });
    }

    return res.status(200).json({
      data: {
        query,
        results,
        counts,
        suggestions: suggestions.slice(0, 10),
        pagination: { page, limit },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function searchTracks(req, res, next) {
  try {
    const query = requireQuery(req, res);
    if (!query) return;

    const page = safePage(req.query.page);
    const limit = safeLimit(req.query.limit);
    const skip = (page - 1) * limit;
    const creatorIds = await creatorAudioIds();
    const filter = {
      isPublic: true,
      isDeleted: false,
      artist: { $in: creatorIds },
      $or: regexFields(query, ['title', 'description', 'tags']),
    };
    if (req.query.genre) filter.genre = req.query.genre;

    const sort = req.query.sort === 'recent'
      ? { createdAt: -1 }
      : { playCount: -1, createdAt: -1 };

    const [tracks, total] = await Promise.all([
      Audio.find(filter)
        .populate(
          'artist',
          'username displayName avatar userType creatorProfile.artistName creatorProfile.organizationName'
        )
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select(
          'title description duration genre fileUrl coverArt coverArtMode coverArtVariant playCount likeCount createdAt artist'
        ),
      Audio.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: {
        tracks: tracks.map(trackResult),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function searchCreators(req, res, next) {
  try {
    const query = requireQuery(req, res);
    if (!query) return;

    const page = safePage(req.query.page);
    const limit = safeLimit(req.query.limit);
    const skip = (page - 1) * limit;
    const filter = {
      userType: 'creator',
      isActive: true,
      onboardingCompleted: true,
      $or: regexFields(query, [
        'username',
        'displayName',
        'creatorProfile.artistName',
        'creatorProfile.organizationName',
        'creatorProfile.about',
      ]),
    };

    const [creators, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('username displayName avatar bio creatorProfile userType createdAt'),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: {
        creators: creators.map(creatorResult),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPopularSearches(req, res, next) {
  try {
    const creatorIds = await creatorAudioIds();
    const [tracks, stations] = await Promise.all([
      Audio.find({
        isPublic: true,
        isDeleted: false,
        artist: { $in: creatorIds },
      })
        .sort({ playCount: -1, createdAt: -1 })
        .limit(5)
        .select('title playCount'),
      Station.find({ isPublic: true, isDeleted: false })
        .sort({ listenerCount: -1, followerCount: -1, createdAt: -1 })
        .limit(5)
        .select('name listenerCount followerCount'),
    ]);

    const data = [
      ...tracks.map((track) => ({
        term: track.title,
        type: 'track',
        count: Number(track.playCount) || 0,
        basis: 'recorded plays',
      })),
      ...stations.map((station) => ({
        term: station.name,
        type: 'station',
        count:
          (Number(station.listenerCount) || 0) +
          (Number(station.followerCount) || 0),
        basis: 'current listeners plus followers',
      })),
    ]
      .sort((first, second) => second.count - first.count)
      .slice(0, 10);

    return res.status(200).json({
      data,
      meta: {
        measured: true,
        note: 'Echoo does not yet record search-query frequency; this list uses recorded content activity instead.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getTrendingSearches(req, res, next) {
  try {
    const creatorIds = await creatorAudioIds();
    const [recentTracks, liveStations] = await Promise.all([
      Audio.find({
        isPublic: true,
        isDeleted: false,
        artist: { $in: creatorIds },
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title createdAt playCount'),
      Station.find({ isPublic: true, isDeleted: false, isLive: true })
        .sort({ listenerCount: -1, createdAt: -1 })
        .limit(5)
        .select('name listenerCount createdAt'),
    ]);

    const data = [
      ...liveStations.map((station) => ({
        term: station.name,
        type: 'station',
        live: true,
        activity: Number(station.listenerCount) || 0,
        basis: 'live now',
      })),
      ...recentTracks.map((track) => ({
        term: track.title,
        type: 'track',
        live: false,
        activity: Number(track.playCount) || 0,
        basis: 'recently published',
      })),
    ].slice(0, 10);

    return res.status(200).json({
      data,
      meta: {
        measured: false,
        note: 'Echoo does not yet collect search-trend time series. This endpoint returns live and recent public content without inventing trend percentages.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
