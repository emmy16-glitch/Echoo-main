import Audio from '../models/Audio.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upload directory
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Upload audio file
export async function uploadAudio(req, res, next) {
  try {
    console.log('Upload request received');
    console.log('File:', req.file);
    console.log('Body:', req.body);

    if (!req.file) {
      return res.status(400).json({
        error: { code: 'NO_FILE', message: 'No audio file uploaded' }
      });
    }

    const { title, description, genre, tags, isPublic } = req.body;

    // Parse tags if provided as JSON string
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = JSON.parse(tags);
      } catch (e) {
        parsedTags = tags.split(',').map(t => t.trim());
      }
    }

    // Create audio record
    const audio = new Audio({
      title: title || req.file.originalname,
      description: description || '',
      artist: req.userId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      fileUrl: `/uploads/audio/${req.file.filename}`,
      fileKey: req.file.filename,
      mimeType: req.file.mimetype,
      genre: genre || 'Other',
      tags: parsedTags,
      isPublic: isPublic === 'true' || isPublic === true,
    });

    await audio.save();

    console.log('Audio uploaded:', audio.title);

    return res.status(201).json({
      data: audio,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Upload error:', error);
    next(error);
  }
}

// Get all audio (with pagination and filters)
export async function getAudio(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const filter = { isDeleted: false };

    // Apply filters
    if (req.query.public === 'true') {
      filter.isPublic = true;
    }
    if (req.query.genre) {
      filter.genre = req.query.genre;
    }
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }
    if (req.query.userId) {
      filter.artist = req.query.userId;
    }

    const audio = await Audio.find(filter)
      .populate('artist', 'username displayName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Audio.countDocuments(filter);

    return res.status(200).json({
      data: audio,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get single audio
export async function getAudioById(req, res, next) {
  try {
    const audio = await Audio.findById(req.params.id)
      .populate('artist', 'username displayName bio avatar');

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    // Check if user has access
    if (!audio.isPublic && audio.artist._id.toString() !== req.userId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this audio' }
      });
    }

    return res.status(200).json({
      data: audio,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update audio metadata
export async function updateAudio(req, res, next) {
  try {
    const { title, description, genre, tags, isPublic } = req.body;

    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    // Check ownership - compare as strings
    if (audio.artist.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this audio' }
      });
    }

    // Update fields
    if (title) audio.title = title;
    if (description !== undefined) audio.description = description;
    if (genre) audio.genre = genre;
    if (tags) {
      if (typeof tags === 'string') {
        audio.tags = tags.split(',').map(t => t.trim());
      } else {
        audio.tags = tags;
      }
    }
    if (isPublic !== undefined) audio.isPublic = isPublic;

    await audio.save();

    return res.status(200).json({
      data: audio,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Delete audio
export async function deleteAudio(req, res, next) {
  try {
    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    // Check ownership - compare as strings
    if (audio.artist.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this audio' }
      });
    }

    // Soft delete
    audio.isDeleted = true;
    await audio.save();

    return res.status(200).json({
      data: { message: 'Audio deleted successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Increment play count
export async function incrementPlays(req, res, next) {
  try {
    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    await audio.incrementPlays();

    return res.status(200).json({
      data: { playCount: audio.playCount },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Like/Unlike audio
export async function toggleLike(req, res, next) {
  try {
    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    await audio.incrementLikes();

    return res.status(200).json({
      data: { likeCount: audio.likeCount },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
