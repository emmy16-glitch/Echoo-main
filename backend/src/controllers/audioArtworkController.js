import fs from 'fs';
import path from 'path';

import Audio from '../models/Audio.js';

const uploadedCoverPath = (coverArt) => {
  const value = String(coverArt || '');
  if (!value.startsWith('/uploads/audio-covers/')) return null;
  const filename = path.basename(value);
  if (!filename) return null;
  return path.join(process.cwd(), 'uploads', 'audio-covers', filename);
};

const removeLocalCover = async (absolutePath) => {
  if (!absolutePath) return;
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Recording artwork cleanup warning:', error?.message || error);
    }
  }
};

export async function updateAudioCover(req, res, next) {
  try {
    const coverFile = req.file || req.files?.cover?.[0] || null;
    if (!coverFile?.filename) {
      return res.status(400).json({
        error: {
          code: 'COVER_REQUIRED',
          message: 'Choose a JPG, PNG or WebP image for this recording.',
        },
      });
    }

    const audio = await Audio.findById(req.params.id);
    if (!audio || audio.isDeleted) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording not found' },
      });
    }

    if (String(audio.artist) !== String(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this recording' },
      });
    }

    const previousUploadedCover =
      audio.coverArtMode === 'uploaded' ? uploadedCoverPath(audio.coverArt) : null;

    audio.coverArt = `/uploads/audio-covers/${coverFile.filename}`;
    audio.coverArtMode = 'uploaded';
    audio.coverArtVariant = 0;
    await audio.save();

    // From this point the new file belongs to the saved Recording. The shared
    // upload error cleanup middleware must not remove it if a later noncritical
    // notification step fails.
    req.audioUploadCommitted = true;

    const newCoverPath = uploadedCoverPath(audio.coverArt);
    if (previousUploadedCover && previousUploadedCover !== newCoverPath) {
      await removeLocalCover(previousUploadedCover);
    }

    req.app.get('io')?.emit('catalog:changed', {
      entity: 'audio',
      action: 'artwork_updated',
      audioId: String(audio._id),
    });

    return res.status(200).json({
      data: audio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}
