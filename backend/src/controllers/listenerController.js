import User from '../models/User.js';
import Audio from '../models/Audio.js';

// Get listener dashboard
export async function getListenerDashboard(req, res, next) {
  try {
    const userId = req.userId;

    // Get user with preferences
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Get continue listening tracks
    const continueListening = await getContinueListening(userId);

    // Get recommended tracks
    const recommendedTracks = await getRecommendedTracks(userId);

    // Get live now tracks
    const liveNow = await getLiveNow();

    // Get top categories
    const topCategories = getTopCategories();

    // Get greeting based on time
    const greeting = getGreeting();

    // Get user's display name
    const displayName = user.displayName || user.username;

    return res.status(200).json({
      data: {
        greeting: `${greeting}, ${displayName}`,
        continueListening,
        recommendedTracks,
        liveNow,
        topCategories,
        totalTracks: await Audio.countDocuments({ isPublic: true, isDeleted: false }),
        recentActivity: await getRecentActivity(userId),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    next(error);
  }
}

// Get continue listening tracks
async function getContinueListening(userId) {
  try {
    const user = await User.findById(userId)
      .populate('continueListening.trackId', 'title duration artist');

    if (!user || !user.continueListening || user.continueListening.length === 0) {
      return [
        {
          title: 'The Daily Motivation',
          subtitle: 'Keep going',
          episode: 'Episode 24 • 18 min left',
          progress: 65,
        },
        {
          title: 'Sunday Message',
          subtitle: 'Keep going',
          episode: '1h 02min left',
          progress: 45,
        },
        {
          title: 'Deep Focus Podcast',
          subtitle: 'Keep going',
          episode: 'Episode 15 • 32 min left',
          progress: 30,
        },
        {
          title: 'The Creative Mind',
          subtitle: 'Keep going',
          episode: 'Episode 7 • 10 min left',
          progress: 78,
        },
      ];
    }

    return user.continueListening.map(item => ({
      title: item.title || 'Untitled',
      subtitle: 'Keep going',
      episode: formatEpisode(item.remaining, item.progress),
      progress: item.progress || 0,
    }));
  } catch (error) {
    console.error('Continue listening error:', error);
    return [];
  }
}

// Get recommended tracks
async function getRecommendedTracks(userId) {
  try {
    const user = await User.findById(userId);
    const userCategories = user?.preferences?.categories || ['Faith & Spirituality', 'Education'];
    
    // Get tracks from user's preferred categories
    const tracks = await Audio.find({
      isPublic: true,
      isDeleted: false,
      genre: { $in: userCategories.map(c => mapCategoryToGenre(c)) },
    })
      .populate('artist', 'username displayName')
      .sort({ playCount: -1, createdAt: -1 })
      .limit(8)
      .select('title genre duration createdAt artist');

    if (tracks.length === 0) {
      return [
        { title: 'Mindset Matters', artist: 'Jay Shetty', description: '' },
        { title: 'The Edifi Podcast', artist: 'Edifi Team', description: '' },
        { title: 'Focus Flow', artist: 'LoFi Beats', description: '' },
        { title: 'Real Talk with Mpho', artist: 'Alex Banayan', description: '' },
        { title: 'Growth LAB', artist: 'ALEX BARAITHI', description: '' },
        { title: 'Beyond Sunday', artist: '', description: 'A new perspective on faith and life.' },
        { title: 'Lessons in Life', artist: '', description: 'Real stories. Real people. Real lessons.' },
        { title: 'Tech Trends Daily', artist: '', description: 'Your daily update on technology.' },
      ];
    }

    return tracks.map(track => ({
      id: track._id,
      title: track.title,
      artist: track.artist?.displayName || track.artist?.username || 'Unknown Artist',
      description: '',
      date: track.createdAt,
      duration: formatDuration(track.duration),
    }));
  } catch (error) {
    console.error('Recommended tracks error:', error);
    return [];
  }
}

// Get live now tracks
async function getLiveNow() {
  // This will be populated when Icecast integration is done
  // For now, return mock data
  return [
    {
      title: 'Praise & Worship Live',
      subtitle: 'Live with James',
      listeners: '12.4K',
    },
    {
      title: 'Faith Talk Live',
      subtitle: 'with Pastor Daniel',
      listeners: '8.7K',
    },
    {
      title: 'News Update',
      subtitle: 'Today',
      listeners: '5.3K',
    },
  ];
}

// Get top categories
function getTopCategories() {
  return [
    { name: 'Faith & Spirituality' },
    { name: 'Education' },
    { name: 'News & Politics'},
    { name: 'Business' },
    { name: 'Health & Wellness' },
  ];
}

// Get recent activity
async function getRecentActivity(userId) {
  try {
    const user = await User.findById(userId)
      .populate('listeningHistory.trackId', 'title duration');

    if (!user || !user.listeningHistory || user.listeningHistory.length === 0) {
      return [];
    }

    return user.listeningHistory.slice(-5).map(entry => ({
      title: entry.trackId?.title || 'Unknown Track',
      playedAt: entry.playedAt,
      progress: entry.progress,
      completed: entry.completed,
    }));
  } catch (error) {
    return [];
  }
}

// Get greeting based on time
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Helper functions
function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
}

function formatEpisode(remaining, progress) {
  if (!remaining) return 'Continue listening';
  if (remaining < 60) return `${Math.floor(remaining)} min left`;
  if (remaining < 3600) return `${Math.floor(remaining / 60)}h ${Math.floor(remaining % 60)}min left`;
  return `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}min left`;
}

function mapCategoryToGenre(category) {
  const mapping = {
    'Faith & Spirituality': ['Spiritual', 'Podcast'],
    'Education': ['Educational', 'Podcast'],
    'News & Politics': ['Podcast'],
    'Business': ['Podcast'],
    'Health & Wellness': ['Podcast'],
    'Entertainment': ['Comedy', 'Storytelling'],
    'Technology': ['Podcast'],
    'Sports': ['Podcast'],
    'Music': ['Pop', 'Rock', 'Electronic', 'Jazz', 'Classical', 'R&B'],
    'Comedy': ['Comedy'],
    'Storytelling': ['Storytelling'],
    'Other': ['Other'],
  };
  return mapping[category] || ['Other'];
}
