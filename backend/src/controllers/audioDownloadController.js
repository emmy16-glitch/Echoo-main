import fs from 'fs';
import path from 'path';

export async function downloadAuthorizedAudio(req, res, next) {
  try {
    const audio = req.audioAccessRecord;
    if (!audio) {
      return res.status(500).json({
        error: {
          code: 'AUDIO_ACCESS_CONTEXT_MISSING',
          message: 'Audio download authorization context is missing.',
        },
      });
    }

    const storedFilename = path.basename(String(audio.filename || audio.fileKey || ''));
    if (!storedFilename) {
      return res.status(404).json({
        error: {
          code: 'AUDIO_FILE_MISSING',
          message: 'The audio file is not available on this backend.',
        },
      });
    }

    const absolutePath = path.join(process.cwd(), 'uploads', 'audio', storedFilename);
    let stat;
    try {
      stat = await fs.promises.stat(absolutePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return res.status(404).json({
          error: {
            code: 'AUDIO_FILE_MISSING',
            message: 'The audio file is not available on this backend.',
          },
        });
      }
      throw error;
    }

    if (!stat.isFile()) {
      return res.status(404).json({
        error: {
          code: 'AUDIO_FILE_MISSING',
          message: 'The audio file is not available on this backend.',
        },
      });
    }

    res.setHeader('Cache-Control', 'private, no-store, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (audio.mimeType) res.setHeader('Content-Type', audio.mimeType);

    return res.download(
      absolutePath,
      audio.originalName || storedFilename,
      (downloadError) => {
        if (downloadError && !res.headersSent) next(downloadError);
      }
    );
  } catch (error) {
    return next(error);
  }
}

export default downloadAuthorizedAudio;
