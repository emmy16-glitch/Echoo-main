import mongoose from 'mongoose';
import Audio from '../models/Audio.js';
import Playlist from '../models/Playlist.js';
import Station from '../models/Station.js';
import User from '../models/User.js';
import { isAudioAccessibleToUser } from '../services/audioAccess.js';

const OWNER_FIELDS = 'username displayName avatar';
const TRACK_FIELDS = 'title description duration coverArt genre artist createdAt isPublic visibility publicationStatus isDeleted';
const idOf = (value) => String(value?._id || value?.id || value || '');
const validId = (value) => mongoose.isValidObjectId(value);

const error = (res, status, code, message) =>
  res.status(status).json({ error: { code, message } });

const requireCreator = (req, res) => {
  if (req.user?.userType === 'creator') return true;
  error(res, 403, 'FORBIDDEN', 'Only creators can manage Collections');
  return false;
};

const populateCollection = (query) => query
  .populate('owner', OWNER_FIELDS)
  .populate('station', 'name slug coverArt category isPublic')
  .populate('tracks.trackId', TRACK_FIELDS);

const visibleTracks = (collection, viewerId) => (collection.tracks || [])
  .filter((entry) => isAudioAccessibleToUser(entry?.trackId, viewerId))
  .map((entry) => entry.trackId)
  .filter(Boolean);

const serialize = (collection, viewerId = null, savedIds = new Set()) => {
  if (!collection) return null;
  const plain = collection.toObject ? collection.toObject({ getters: true }) : { ...collection };
  const id = idOf(plain);
  const ownerId = idOf(plain.owner);
  const tracks = visibleTracks(plain, viewerId);
  return {
    id,
    title: plain.name || 'Untitled Collection',
    description: plain.description || '',
    coverArt: plain.coverArt || tracks[0]?.coverArt || null,
    station: plain.station || null,
    stationId: idOf(plain.station),
    creator: plain.owner || null,
    creatorId: ownerId,
    broadcastCount: tracks.length,
    recordings: tracks,
    isPublic: plain.isPublic === true,
    isSaved: savedIds.has(id),
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
};

async function savedIdSet(userId) {
  if (!userId) return new Set();
  const user = await User.findById(userId).select('savedCollections');
  return new Set((user?.savedCollections || []).map(idOf));
}

async function findOwnedCollection(id, userId) {
  if (!validId(id)) return null;
  return Playlist.findOne({ _id: id, owner: userId, mode: 'series', isDeleted: false });
}

async function canonicalStationForCreator(userId) {
  return Station.findOne({ owner: userId, isDeleted: false })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 });
}

export async function createCollection(req, res, next) {
  try {
    if (!requireCreator(req, res)) return;
    const title = String(req.body.title || '').trim();
    if (!title) return error(res, 400, 'VALIDATION_ERROR', 'Collection name is required');
    if (title.length > 100) return error(res, 400, 'VALIDATION_ERROR', 'Collection name cannot exceed 100 characters');
    const station = await canonicalStationForCreator(req.userId);
    if (!station) return error(res, 400, 'CHANNEL_REQUIRED', 'Create your Channel before creating a Collection');

    const collection = await Playlist.create({
      name: title,
      description: String(req.body.description || '').trim().slice(0, 500),
      coverArt: req.body.coverArt ? String(req.body.coverArt).slice(0, 4000) : null,
      owner: req.userId,
      station: station._id,
      mode: 'series',
      isPublic: req.body.isPublic !== false,
      isCollaborative: false,
      tracks: [],
      trackCount: 0,
    });
    const populated = await populateCollection(Playlist.findById(collection._id));
    return res.status(201).json({ data: serialize(populated, req.userId), timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function getMyCollections(req, res, next) {
  try {
    if (!requireCreator(req, res)) return;
    const canonicalStation = await canonicalStationForCreator(req.userId);
    if (canonicalStation) {
      await Playlist.updateMany(
        { owner: req.userId, mode: 'series', isDeleted: false, station: { $ne: canonicalStation._id } },
        { $set: { station: canonicalStation._id } }
      );
    }
    const collections = await populateCollection(
      Playlist.find({ owner: req.userId, mode: 'series', isDeleted: false }).sort({ updatedAt: -1 })
    );
    return res.status(200).json({ data: collections.map((item) => serialize(item, req.userId)), timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function getPublicCollectionsForStation(req, res, next) {
  try {
    if (!validId(req.params.stationId)) return error(res, 400, 'INVALID_STATION_ID', 'Invalid Channel');
    const saved = await savedIdSet(req.userId);
    const collections = await populateCollection(
      Playlist.find({ station: req.params.stationId, mode: 'series', isDeleted: false, isPublic: true })
        .sort({ updatedAt: -1 })
    );
    return res.status(200).json({ data: collections.map((item) => serialize(item, req.userId, saved)), timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function getCollection(req, res, next) {
  try {
    if (!validId(req.params.id)) return error(res, 400, 'INVALID_COLLECTION_ID', 'Invalid Collection');
    const collection = await populateCollection(
      Playlist.findOne({ _id: req.params.id, mode: 'series', isDeleted: false })
    );
    if (!collection) return error(res, 404, 'NOT_FOUND', 'Collection not found');
    const owns = idOf(collection.owner) === idOf(req.userId);
    if (!collection.isPublic && !owns) return error(res, 404, 'NOT_FOUND', 'Collection not found');
    const saved = await savedIdSet(req.userId);
    return res.status(200).json({ data: serialize(collection, req.userId, saved), timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function updateCollection(req, res, next) {
  try {
    if (!requireCreator(req, res)) return;
    const collection = await findOwnedCollection(req.params.id, req.userId);
    if (!collection) return error(res, 404, 'NOT_FOUND', 'Collection not found');
    if (req.body.title !== undefined) {
      const title = String(req.body.title || '').trim();
      if (!title) return error(res, 400, 'VALIDATION_ERROR', 'Collection name is required');
      collection.name = title.slice(0, 100);
    }
    if (req.body.description !== undefined) collection.description = String(req.body.description || '').trim().slice(0, 500);
    if (req.file?.filename) collection.coverArt = `/uploads/collection-covers/${req.file.filename}`;
    else if (req.body.coverArt !== undefined) collection.coverArt = req.body.coverArt ? String(req.body.coverArt).slice(0, 4000) : null;
    if (req.body.isPublic !== undefined) collection.isPublic = Boolean(req.body.isPublic);
    await collection.save();
    const populated = await populateCollection(Playlist.findById(collection._id));
    return res.status(200).json({ data: serialize(populated, req.userId), timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function deleteCollection(req, res, next) {
  try {
    if (!requireCreator(req, res)) return;
    const collection = await findOwnedCollection(req.params.id, req.userId);
    if (!collection) return error(res, 404, 'NOT_FOUND', 'Collection not found');
    collection.isDeleted = true;
    await collection.save();
    await User.updateMany({ savedCollections: collection._id }, { $pull: { savedCollections: collection._id } });
    return res.status(200).json({ data: { message: 'Collection deleted' }, timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function addRecordings(req, res, next) {
  try {
    if (!requireCreator(req, res)) return;
    const collection = await findOwnedCollection(req.params.id, req.userId);
    if (!collection) return error(res, 404, 'NOT_FOUND', 'Collection not found');
    const ids = [...new Set((Array.isArray(req.body.recordingIds) ? req.body.recordingIds : [req.body.recordingId])
      .filter(validId).map(String))];
    if (!ids.length) return error(res, 400, 'VALIDATION_ERROR', 'Choose at least one recording');
    const recordings = await Audio.find({ _id: { $in: ids }, artist: req.userId, isDeleted: false }).select('_id');
    if (recordings.length !== ids.length) return error(res, 403, 'FORBIDDEN', 'You can only add your own recordings');
    const existing = new Set(collection.tracks.map((entry) => idOf(entry.trackId)));
    const duplicates = ids.filter((id) => existing.has(id));
    if (duplicates.length) return error(res, 409, 'RECORDING_ALREADY_IN_COLLECTION', 'A selected recording is already in this Collection');
    ids.forEach((trackId) => collection.tracks.push({ trackId, addedBy: req.userId }));
    collection.trackCount = collection.tracks.length;
    await collection.save();
    const populated = await populateCollection(Playlist.findById(collection._id));
    return res.status(200).json({ data: serialize(populated, req.userId), timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function removeRecording(req, res, next) {
  try {
    if (!requireCreator(req, res)) return;
    if (!validId(req.params.recordingId)) return error(res, 400, 'INVALID_RECORDING_ID', 'Invalid recording');
    const collection = await findOwnedCollection(req.params.id, req.userId);
    if (!collection) return error(res, 404, 'NOT_FOUND', 'Collection not found');
    const previousLength = collection.tracks.length;
    collection.tracks = collection.tracks.filter((entry) => idOf(entry.trackId) !== String(req.params.recordingId));
    if (collection.tracks.length === previousLength) return error(res, 404, 'NOT_FOUND', 'Recording is not in this Collection');
    collection.trackCount = collection.tracks.length;
    await collection.save();
    const populated = await populateCollection(Playlist.findById(collection._id));
    return res.status(200).json({ data: serialize(populated, req.userId), timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function reorderCollection(req, res, next) {
  try {
    if (!requireCreator(req, res)) return;
    const ids = Array.isArray(req.body.recordingIds) ? req.body.recordingIds.map(String) : [];
    const collection = await findOwnedCollection(req.params.id, req.userId);
    if (!collection) return error(res, 404, 'NOT_FOUND', 'Collection not found');
    const existing = collection.tracks.map((entry) => idOf(entry.trackId));
    if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some((id) => !existing.includes(id))) {
      return error(res, 400, 'INVALID_COLLECTION_ORDER', 'The Collection order must contain each recording exactly once');
    }
    const byId = new Map(collection.tracks.map((entry) => [idOf(entry.trackId), entry]));
    collection.tracks = ids.map((id) => byId.get(id));
    await collection.save();
    const populated = await populateCollection(Playlist.findById(collection._id));
    return res.status(200).json({ data: serialize(populated, req.userId), timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function saveCollection(req, res, next) {
  try {
    if (req.user?.userType !== 'listener') return error(res, 403, 'FORBIDDEN', 'Only listeners can save Collections');
    const collection = await Playlist.findOne({ _id: req.params.id, mode: 'series', isDeleted: false, isPublic: true }).select('_id');
    if (!collection) return error(res, 404, 'NOT_FOUND', 'Collection not found');
    await User.updateOne({ _id: req.userId }, { $addToSet: { savedCollections: collection._id } });
    return res.status(200).json({ data: { saved: true }, timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function unsaveCollection(req, res, next) {
  try {
    if (req.user?.userType !== 'listener') return error(res, 403, 'FORBIDDEN', 'Only listeners can save Collections');
    await User.updateOne({ _id: req.userId }, { $pull: { savedCollections: req.params.id } });
    return res.status(200).json({ data: { saved: false }, timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}

export async function getSavedCollections(req, res, next) {
  try {
    if (req.user?.userType !== 'listener') return error(res, 403, 'FORBIDDEN', 'Only listeners can view saved Collections');
    const saved = await savedIdSet(req.userId);
    const collections = await populateCollection(
      Playlist.find({ _id: { $in: [...saved] }, mode: 'series', isDeleted: false, isPublic: true }).sort({ updatedAt: -1 })
    );
    return res.status(200).json({ data: collections.map((item) => serialize(item, req.userId, saved)), timestamp: new Date().toISOString() });
  } catch (caught) {
    return next(caught);
  }
}
