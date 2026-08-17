import Station from '../models/Station.js';
import User from '../models/User.js';
import { createSlug } from '../utils/helpers.js';

// Create station
export async function createStation(req, res, next) {
  try {
    const { name, description, category, tags, isPublic, coverArt } = req.body;
    const userId = req.userId;

    if (!name) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Station name is required' }
      });
    }

    // Check if user is a creator
    const user = await User.findById(userId);
    if (user.userType !== 'creator') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only creators can create stations' }
      });
    }

    // Generate slug
    const slug = createSlug(name);

    // Check if slug exists
    const existingStation = await Station.findOne({ slug });
    if (existingStation) {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'Station name already exists' }
      });
    }

    const station = new Station({
      name,
      slug,
      description: description || '',
      owner: userId,
      category: category || 'Other',
      tags: tags || [],
      isPublic: isPublic !== undefined ? isPublic : true,
      coverArt: coverArt || null,
    });

    await station.save();

    return res.status(201).json({
      data: station,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get all stations
export async function getStations(req, res, next) {
  try {
    const { page = 1, limit = 20, category, search, featured, live } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = { isDeleted: false };

    if (category) filter.category = category;
    if (featured === 'true') filter.isFeatured = true;
    if (live === 'true') filter.isLive = true;
    if (search) {
      filter.$text = { $search: search };
    }

    const stations = await Station.find(filter)
      .populate('owner', 'username displayName avatar')
      .sort({ isLive: -1, listenerCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Station.countDocuments(filter);

    return res.status(200).json({
      data: stations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get single station
export async function getStationById(req, res, next) {
  try {
    const { stationId } = req.params;

    const station = await Station.findById(stationId)
      .populate('owner', 'username displayName avatar bio');

    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' }
      });
    }

    if (!station.isPublic && station.owner._id.toString() !== req.userId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this station' }
      });
    }

    return res.status(200).json({
      data: station,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update station
export async function updateStation(req, res, next) {
  try {
    const { stationId } = req.params;
    const { name, description, category, tags, isPublic, coverArt, isFeatured } = req.body;

    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' }
      });
    }

    // Check ownership
    if (station.owner.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this station' }
      });
    }

    if (name) {
      station.name = name;
      station.slug = createSlug(name);
    }
    if (description !== undefined) station.description = description;
    if (category) station.category = category;
    if (tags) station.tags = tags;
    if (isPublic !== undefined) station.isPublic = isPublic;
    if (coverArt) station.coverArt = coverArt;
    if (isFeatured !== undefined) station.isFeatured = isFeatured;

    await station.save();

    return res.status(200).json({
      data: station,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Delete station
export async function deleteStation(req, res, next) {
  try {
    const { stationId } = req.params;

    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' }
      });
    }

    if (station.owner.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this station' }
      });
    }

    station.isDeleted = true;
    await station.save();

    return res.status(200).json({
      data: { message: 'Station deleted successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Toggle live status
export async function toggleLive(req, res, next) {
  try {
    const { stationId } = req.params;
    const { isLive } = req.body;

    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' }
      });
    }

    if (station.owner.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this station' }
      });
    }

    await station.toggleLive(isLive);

    return res.status(200).json({
      data: {
        station,
        isLive: station.isLive,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get station schedule
export async function getStationSchedule(req, res, next) {
  try {
    const { stationId } = req.params;

    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' }
      });
    }

    return res.status(200).json({
      data: {
        station: station.name,
        schedule: station.schedule || [],
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update station schedule
export async function updateStationSchedule(req, res, next) {
  try {
    const { stationId } = req.params;
    const { schedule } = req.body;

    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' }
      });
    }

    if (station.owner.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this station' }
      });
    }

    station.schedule = schedule;
    await station.save();

    return res.status(200).json({
      data: {
        station: station.name,
        schedule: station.schedule,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
