import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Playlist from '../models/Playlist.js';

// Global search
export async function globalSearch(req, res, next) {
  try {
    const { q, type, category, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Search query must be at least 2 characters' }
      });
    }

    const query = q.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const searchTypes = type ? type.split(',') : ['tracks', 'creators', 'playlists'];

    const results = {};
    const counts = {};

    // Search tracks
    if (searchTypes.includes('tracks')) {
      const tracksQuery = {
        isPublic: true,
        isDeleted: false,
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { tags: { $regex: query, $options: 'i' } },
        ],
      };

      if (category) {
        tracksQuery.genre = category;
      }

      const tracks = await Audio.find(tracksQuery)
        .populate('artist', 'username displayName avatar')
        .sort({ playCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('title description duration genre fileUrl playCount likeCount createdAt');

      const total = await Audio.countDocuments(tracksQuery);

      results.tracks = tracks.map(track => ({
        id: track._id,
        title: track.title,
        description: track.description,
        duration: track.duration,
        genre: track.genre,
        fileUrl: track.fileUrl,
        playCount: track.playCount,
        likeCount: track.likeCount,
        artist: track.artist ? {
          id: track.artist._id,
          username: track.artist.username,
          displayName: track.artist.displayName,
          avatar: track.artist.avatar,
        } : null,
        createdAt: track.createdAt,
      }));

      counts.tracks = total;
    }

    // Search creators
    if (searchTypes.includes('creators')) {
      const creatorsQuery = {
        userType: 'creator',
        isActive: true,
        onboardingCompleted: true,
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { displayName: { $regex: query, $options: 'i' } },
          { 'creatorProfile.artistName': { $regex: query, $options: 'i' } },
          { 'creatorProfile.organizationName': { $regex: query, $options: 'i' } },
          { 'creatorProfile.about': { $regex: query, $options: 'i' } },
        ],
      };

      const creators = await User.find(creatorsQuery)
        .sort({ 'creatorProfile.totalListeners': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('username displayName avatar bio creatorProfile userType');

      const total = await User.countDocuments(creatorsQuery);

      results.creators = creators.map(user => ({
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
        userType: user.userType,
        creatorType: user.creatorProfile?.creatorType,
        artistName: user.creatorProfile?.artistName,
        organizationName: user.creatorProfile?.organizationName,
        totalListeners: user.creatorProfile?.totalListeners || 0,
        isVerified: user.creatorProfile?.isVerified || false,
      }));

      counts.creators = total;
    }

    // Search playlists
    if (searchTypes.includes('playlists')) {
      const playlistsQuery = {
        isPublic: true,
        isDeleted: false,
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
        ],
      };

      const playlists = await Playlist.find(playlistsQuery)
        .populate('owner', 'username displayName avatar')
        .sort({ followerCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('name description coverArt trackCount followerCount isPublic createdAt');

      const total = await Playlist.countDocuments(playlistsQuery);

      results.playlists = playlists.map(playlist => ({
        id: playlist._id,
        name: playlist.name,
        description: playlist.description,
        coverArt: playlist.coverArt,
        trackCount: playlist.trackCount,
        followerCount: playlist.followerCount,
        isPublic: playlist.isPublic,
        owner: playlist.owner ? {
          id: playlist.owner._id,
          username: playlist.owner.username,
          displayName: playlist.owner.displayName,
          avatar: playlist.owner.avatar,
        } : null,
        createdAt: playlist.createdAt,
      }));

      counts.playlists = total;
    }

    // Get search suggestions
    const suggestions = await getSearchSuggestions(query);

    return res.status(200).json({
      data: {
        query,
        results,
        counts,
        suggestions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get search suggestions
async function getSearchSuggestions(query) {
  try {
    const suggestions = [];

    // Get track title suggestions
    const tracks = await Audio.find({
      isPublic: true,
      isDeleted: false,
      title: { $regex: query, $options: 'i' },
    })
      .limit(5)
      .select('title');

    tracks.forEach(track => {
      suggestions.push({
        type: 'track',
        label: track.title,
        value: track.title,
      });
    });

    // Get creator suggestions
    const creators = await User.find({
      userType: 'creator',
      isActive: true,
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { displayName: { $regex: query, $options: 'i' } },
        { 'creatorProfile.artistName': { $regex: query, $options: 'i' } },
      ],
    })
      .limit(3)
      .select('username displayName creatorProfile');

    creators.forEach(user => {
      const name = user.displayName || user.username;
      suggestions.push({
        type: 'creator',
        label: name,
        value: name,
        avatar: user.avatar,
      });
    });

    // Get genre suggestions
    const genres = ['Pop', 'Rock', 'Electronic', 'Jazz', 'Classical', 'R&B', 'Country', 'Metal', 'Reggae', 'Podcast', 'Spiritual', 'Educational', 'Comedy', 'Storytelling', 'Other'];
    const matchingGenres = genres.filter(g => 
      g.toLowerCase().includes(query.toLowerCase())
    );

    matchingGenres.forEach(genre => {
      suggestions.push({
        type: 'genre',
        label: genre,
        value: genre,
      });
    });

    // Limit suggestions
    return suggestions.slice(0, 10);
  } catch (error) {
    console.error('Search suggestions error:', error);
    return [];
  }
}

// Search tracks only
export async function searchTracks(req, res, next) {
  try {
    const { q, genre, sort = 'relevance', page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Search query must be at least 2 characters' }
      });
    }

    const query = q.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const searchQuery = {
      isPublic: true,
      isDeleted: false,
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { tags: { $regex: query, $options: 'i' } },
      ],
    };

    if (genre) {
      searchQuery.genre = genre;
    }

    let sortOption = { createdAt: -1 };
    switch (sort) {
      case 'popular':
        sortOption = { playCount: -1 };
        break;
      case 'recent':
        sortOption = { createdAt: -1 };
        break;
      case 'relevance':
      default:
        sortOption = { playCount: -1, createdAt: -1 };
        break;
    }

    const tracks = await Audio.find(searchQuery)
      .populate('artist', 'username displayName avatar')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .select('title description duration genre fileUrl playCount likeCount createdAt');

    const total = await Audio.countDocuments(searchQuery);

    return res.status(200).json({
      data: {
        tracks: tracks.map(track => ({
          id: track._id,
          title: track.title,
          description: track.description,
          duration: track.duration,
          genre: track.genre,
          fileUrl: track.fileUrl,
          playCount: track.playCount,
          likeCount: track.likeCount,
          artist: track.artist ? {
            id: track.artist._id,
            username: track.artist.username,
            displayName: track.artist.displayName,
            avatar: track.artist.avatar,
          } : null,
          createdAt: track.createdAt,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Search creators only
export async function searchCreators(req, res, next) {
  try {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Search query must be at least 2 characters' }
      });
    }

    const query = q.trim();
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const searchQuery = {
      userType: 'creator',
      isActive: true,
      onboardingCompleted: true,
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { displayName: { $regex: query, $options: 'i' } },
        { 'creatorProfile.artistName': { $regex: query, $options: 'i' } },
        { 'creatorProfile.organizationName': { $regex: query, $options: 'i' } },
        { 'creatorProfile.about': { $regex: query, $options: 'i' } },
      ],
    };

    const creators = await User.find(searchQuery)
      .sort({ 'creatorProfile.totalListeners': -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('username displayName avatar bio creatorProfile userType');

    const total = await User.countDocuments(searchQuery);

    return res.status(200).json({
      data: {
        creators: creators.map(user => ({
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
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get popular searches
export async function getPopularSearches(req, res, next) {
  try {
    // This would typically come from analytics
    const popularSearches = [
      { term: 'Faith & Spirituality', type: 'category', count: 1250 },
      { term: 'Podcast', type: 'genre', count: 980 },
      { term: 'Music', type: 'category', count: 870 },
      { term: 'Education', type: 'category', count: 650 },
      { term: 'News', type: 'category', count: 540 },
      { term: 'Mindset', type: 'track', count: 430 },
      { term: 'Motivation', type: 'track', count: 380 },
      { term: 'Business', type: 'category', count: 320 },
    ];

    return res.status(200).json({
      data: popularSearches,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get trending searches
export async function getTrendingSearches(req, res, next) {
  try {
    // This would typically come from analytics
    const trendingSearches = [
      { term: 'Faith Talk', type: 'track', trend: 45 },
      { term: 'Worship Live', type: 'creator', trend: 38 },
      { term: 'Deep Focus', type: 'playlist', trend: 32 },
      { term: 'Healing Prayer', type: 'track', trend: 28 },
      { term: 'Church Online', type: 'creator', trend: 25 },
    ];

    return res.status(200).json({
      data: trendingSearches,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
