import mongoose from 'mongoose';
import Station from '../models/Station.js';
import Broadcast from '../models/Broadcast.js';
import User from '../models/User.js';
import { createSlug } from '../utils/helpers.js';

const OWNER_FIELDS =
  'username displayName avatar bio userType creatorProfile.category creatorProfile.artistName creatorProfile.organizationName creatorProfile.organizationLogo creatorProfile.isVerified';

function validId(value) {
  return mongoose.isValidObjectId(value);
}

function invalidId(res) {
  return res.status(400).json({
    error: { code: 'INVALID_STATION_ID', message: 'Invalid station ID' },
  });
}

function populateOwner(query) {
  return query.populate('owner', OWNER_FIELDS);
}

export async function createStation(req, res, next) {
  try {
    const {
      name,
      description = '',
      category = 'Other',
      tags = [],
      isPublic = true,
      coverArt = null,
    } = req.body;

    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Station name is required' },
      });
    }

    const user = await User.findById(req.userId).select('_id userType isActive');
    if (!user || !user.isActive) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    if (user.userType !== 'creator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only creators can create stations',
        },
      });
    }

    const slug = createSlug(cleanName);
    const existing = await Station.findOne({ slug, isDeleted: false }).select('_id');

    if (existing) {
      return res.status(409).json({
        error: {
          code: 'STATION_NAME_TAKEN',
          message: 'A station with this name already exists',
        },
      });
    }

    const station = await Station.create({
      name: cleanName,
      slug,
      description,
      owner: req.userId,
      category,
      tags: Array.isArray(tags) ? tags : [],
      isPublic: isPublic !== false,
      coverArt,
      isLive: false,
      listenerCount: 0,
    });

    const populated = await populateOwner(Station.findById(station._id));

    return res.status(201).json({
      data: populated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        error: {
          code: 'STATION_NAME_TAKEN',
          message: 'A station with this name already exists',
        },
      });
    }
    next(error);
  }
}

export async function getStations(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      featured,
      live,
    } = req.query;

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = {
      isDeleted: false,
      isPublic: true,
    };

    if (category) filter.category = category;
    if (featured === 'true') filter.isFeatured = true;
    if (live === 'true') filter.isLive = true;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const [stations, total] = await Promise.all([
      populateOwner(
        Station.find(filter)
          .sort({ isLive: -1, listenerCount: -1, createdAt: -1 })
          .skip(skip)
          .limit(safeLimit)
      ),
      Station.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: stations,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyStations(req, res, next) {
  try {
    const stations = await populateOwner(
      Station.find({
        owner: req.userId,
        isDeleted: false,
      }).sort({ createdAt: -1 })
    );

    return res.status(200).json({
      data: stations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getStationById(req, res, next) {
  try {
    const { stationId } = req.params;
    if (!validId(stationId)) return invalidId(res);

    const station = await populateOwner(
      Station.findOne({
        _id: stationId,
        isDeleted: false,
      })
    );

    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' },
      });
    }

    const ownerId = station.owner?._id || station.owner;
    const requesterId = req.userId || null;

    if (!station.isPublic && String(ownerId) !== String(requesterId || '')) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'This station is private' },
      });
    }

    return res.status(200).json({
      data: station,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStation(req, res, next) {
  try {
    const { stationId } = req.params;
    if (!validId(stationId)) return invalidId(res);

    const station = await Station.findOne({
      _id: stationId,
      isDeleted: false,
    });

    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' },
      });
    }

    if (String(station.owner) !== String(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this station' },
      });
    }

    const {
      name,
      description,
      category,
      tags,
      isPublic,
      coverArt,
    } = req.body;

    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Station name cannot be empty' },
        });
      }

      const nextSlug = createSlug(cleanName);
      const conflict = await Station.findOne({
        _id: { $ne: station._id },
        slug: nextSlug,
        isDeleted: false,
      }).select('_id');

      if (conflict) {
        return res.status(409).json({
          error: {
            code: 'STATION_NAME_TAKEN',
            message: 'A station with this name already exists',
          },
        });
      }

      station.name = cleanName;
      station.slug = nextSlug;
    }

    if (description !== undefined) station.description = description;
    if (category !== undefined) station.category = category;
    if (tags !== undefined) station.tags = Array.isArray(tags) ? tags : [];
    if (isPublic !== undefined) station.isPublic = Boolean(isPublic);
    if (coverArt !== undefined) station.coverArt = coverArt || null;

    // isLive/listenerCount are intentionally NOT user-editable here.
    // Broadcast lifecycle + LiveKit presence own those fields.
    await station.save();

    const populated = await populateOwner(Station.findById(station._id));

    return res.status(200).json({
      data: populated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        error: {
          code: 'STATION_NAME_TAKEN',
          message: 'A station with this name already exists',
        },
      });
    }
    next(error);
  }
}

export async function deleteStation(req, res, next) {
  try {
    const { stationId } = req.params;
    if (!validId(stationId)) return invalidId(res);

    const station = await Station.findOne({
      _id: stationId,
      isDeleted: false,
    });

    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' },
      });
    }

    if (String(station.owner) !== String(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this station' },
      });
    }

    const activeBroadcast = await Broadcast.exists({
      station: station._id,
      isDeleted: false,
      status: { $in: ['starting', 'live', 'ending'] },
    });

    if (activeBroadcast) {
      return res.status(409).json({
        error: {
          code: 'STATION_HAS_ACTIVE_BROADCAST',
          message: 'End the active broadcast before deleting this station',
        },
      });
    }

    station.isDeleted = true;
    station.isLive = false;
    station.listenerCount = 0;
    await station.save();

    return res.status(200).json({
      data: { message: 'Station deleted successfully' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
