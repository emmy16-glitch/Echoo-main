import Audio from '../models/Audio.js';
import { canAccessReplayAudio } from '../services/assetAccessService.js';

export async function requireAudioDownloadAccess(req, res, next) {
  try {
    const audio = await Audio.findOne({
      _id: req.params.id,
      isDeleted: false,
    }).select('_id artist isPublic visibility publicationStatus sourceBroadcast');

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    if (!await canAccessReplayAudio(audio, req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this audio' },
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export default requireAudioDownloadAccess;
