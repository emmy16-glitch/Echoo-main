import Audio from '../models/Audio.js';
import User from '../models/User.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upload directory
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio');
const TEMP_DIR = path.join(process.cwd(), 'uploads', 'temp');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;
const MAX_CHUNK_SIZE = 5 * 1024 * 1024;

const uploadPath = (uploadId) =>
  UUID_PATTERN.test(String(uploadId || ''))
    ? path.join(TEMP_DIR, String(uploadId))
    : null;

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Initiate upload (create upload session)
export async function initiateUpload(req, res, next) {
  try {
    const userId = req.userId;
    const { filename, fileSize, mimeType } = req.body;

    if (
      typeof filename !== 'string' ||
      !filename.trim() ||
      filename.length > 255 ||
      !Number.isInteger(fileSize) ||
      fileSize <= 0 ||
      typeof mimeType !== 'string'
    ) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Filename, fileSize, and mimeType are required' }
      });
    }

    // Validate file size (100MB max)
    if (fileSize > MAX_UPLOAD_SIZE) {
      return res.status(400).json({
        error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds 100MB limit' }
      });
    }

    // Validate mime type
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/m4a'];
    if (!allowedMimes.includes(mimeType)) {
      return res.status(400).json({
        error: { code: 'INVALID_TYPE', message: 'Only audio files are allowed' }
      });
    }

    // Generate unique upload ID
    const uploadId = randomUUID();
    const tempFilePath = uploadPath(uploadId);

    // Create temp file
    fs.writeFileSync(tempFilePath, '');

    return res.status(200).json({
      data: {
        uploadId,
        filename,
        fileSize,
        mimeType,
        chunkSize: 1024 * 1024, // 1MB chunks
        totalChunks: Math.ceil(fileSize / (1024 * 1024)),
        uploadUrl: `/api/uploads/${uploadId}/chunk`,
        completeUrl: `/api/uploads/${uploadId}/complete`,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Initiate upload error:', error);
    next(error);
  }
}

// Upload chunk
export async function uploadChunk(req, res, next) {
  try {
    const { uploadId } = req.params;
    const { chunkIndex, totalChunks } = req.body;
    const file = req.file;
    const tempFilePath = uploadPath(uploadId);
    const parsedChunkIndex = Number(chunkIndex);
    const parsedTotalChunks = Number(totalChunks);

    if (
      !tempFilePath ||
      !Number.isInteger(parsedChunkIndex) ||
      parsedChunkIndex < 0 ||
      !Number.isInteger(parsedTotalChunks) ||
      parsedTotalChunks <= 0 ||
      parsedChunkIndex >= parsedTotalChunks
    ) {
      return res.status(400).json({
        error: { code: 'INVALID_UPLOAD', message: 'Invalid upload metadata' },
      });
    }

    if (!file) {
      return res.status(400).json({
        error: { code: 'NO_FILE', message: 'No file chunk uploaded' }
      });
    }

    if (file.size > MAX_CHUNK_SIZE) {
      return res.status(400).json({
        error: { code: 'CHUNK_TOO_LARGE', message: 'Upload chunk exceeds the size limit' },
      });
    }
    
    // Check if temp file exists
    if (!fs.existsSync(tempFilePath)) {
      return res.status(404).json({
        error: { code: 'UPLOAD_NOT_FOUND', message: 'Upload session not found' }
      });
    }

    // Append chunk to temp file
    const chunkPath = file.path;
    const data = fs.readFileSync(chunkPath);
    fs.appendFileSync(tempFilePath, data);
    
    // Clean up chunk file
    fs.unlinkSync(chunkPath);

    return res.status(200).json({
      data: {
        chunkIndex: parsedChunkIndex,
        received: true,
        uploaded: fs.statSync(tempFilePath).size,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Upload chunk error:', error);
    next(error);
  }
}

// Complete upload
export async function completeUpload(req, res, next) {
  try {
    const userId = req.userId;
    const { uploadId, title, description, genre, tags, isPublic, coverArt } = req.body;
    const tempFilePath = uploadPath(uploadId);

    if (!tempFilePath) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Upload ID is required' }
      });
    }

    // Check if temp file exists
    if (!fs.existsSync(tempFilePath)) {
      return res.status(404).json({
        error: { code: 'UPLOAD_NOT_FOUND', message: 'Upload session not found' }
      });
    }

    const fileSize = fs.statSync(tempFilePath).size;

    // Generate final filename
    const ext = path.extname(req.body.filename || '');
    const finalFilename = `${Date.now()}-${randomUUID()}${ext}`;
    const finalFilePath = path.join(UPLOAD_DIR, finalFilename);

    // Move temp file to final location
    fs.renameSync(tempFilePath, finalFilePath);

    // Create audio record
    const audio = new Audio({
      title: title || req.body.filename || 'Untitled',
      description: description || '',
      artist: userId,
      filename: finalFilename,
      originalName: req.body.filename || 'unknown',
      fileSize: fileSize,
      fileUrl: `/uploads/audio/${finalFilename}`,
      fileKey: finalFilename,
      mimeType: req.body.mimeType || 'audio/mpeg',
      genre: genre || 'Other',
      tags: tags ? (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags) : [],
      isPublic: isPublic !== undefined ? isPublic : true,
      coverArt: coverArt || null,
      status: 'ready',
    });

    await audio.save();

    // Update user's uploaded audio list
    await User.findByIdAndUpdate(userId, {
      $push: { uploadedAudio: audio._id }
    });

    // Update creator total tracks
    const user = await User.findById(userId);
    if (user && user.creatorProfile) {
      user.creatorProfile.totalTracks = (user.creatorProfile.totalTracks || 0) + 1;
      await user.save();
    }

    // Populate artist info
    await audio.populate('artist', 'username displayName avatar');

    return res.status(201).json({
      data: {
        audio,
        message: 'Upload completed successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Complete upload error:', error);
    next(error);
  }
}

// Get upload status
export async function getUploadStatus(req, res, next) {
  try {
    const { uploadId } = req.params;
    const tempFilePath = uploadPath(uploadId);

    if (!tempFilePath) {
      return res.status(400).json({
        error: { code: 'INVALID_UPLOAD', message: 'Invalid upload ID' },
      });
    }
    
    if (!fs.existsSync(tempFilePath)) {
      return res.status(404).json({
        error: { code: 'UPLOAD_NOT_FOUND', message: 'Upload session not found' }
      });
    }

    const stats = fs.statSync(tempFilePath);

    return res.status(200).json({
      data: {
        uploadId,
        uploadedSize: stats.size,
        status: 'in_progress',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get upload status error:', error);
    next(error);
  }
}

// Cancel upload
export async function cancelUpload(req, res, next) {
  try {
    const { uploadId } = req.params;
    const tempFilePath = uploadPath(uploadId);

    if (!tempFilePath) {
      return res.status(400).json({
        error: { code: 'INVALID_UPLOAD', message: 'Invalid upload ID' },
      });
    }
    
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return res.status(200).json({
      data: {
        message: 'Upload cancelled successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cancel upload error:', error);
    next(error);
  }
}
