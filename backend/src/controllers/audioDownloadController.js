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
    const downloadFilename = path.basename(String(audio.originalName || storedFilename || 'Echoo recording.mp3'));
    if (!storedFilename) {
      return res.status(404).json({
        error: {
          code: 'AUDIO_FILE_MISSING',
          message: 'The audio file is not available on this backend.',
        },
      });
    }

    res.setHeader('Cache-Control', 'private, no-store, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Archived recordings no longer have durable local bytes. Keep the
    // authenticated Echoo download endpoint as the single browser-facing
    // boundary and stream the private S3/B2 object through it.
    if (audio.storage === 'cloud') {
      if (!audio.cloudKey) {
        return res.status(503).json({
          error: {
            code: 'AUDIO_CLOUD_KEY_MISSING',
            message: 'The archived audio cannot be located right now.',
          },
        });
      }

      const { getCloudObject } = await import('../services/audioArchiveService.js');
      let object;
      try {
        object = await getCloudObject(audio.cloudKey);
      } catch (cloudError) {
        console.warn('[audio-download] cloud object fetch failed:', cloudError?.message || cloudError);
        return res.status(503).json({
          error: {
            code: 'AUDIO_CLOUD_UNAVAILABLE',
            message: 'The archived audio is temporarily unavailable.',
          },
        });
      }

      const body = object?.Body;
      if (!body) {
        return res.status(503).json({
          error: {
            code: 'AUDIO_CLOUD_EMPTY',
            message: 'The archived audio is temporarily unavailable.',
          },
        });
      }

      res.setHeader('Content-Type', object.ContentType || audio.mimeType || 'application/octet-stream');
      const contentLength = Number(object.ContentLength || audio.fileSize || 0);
      if (contentLength > 0) res.setHeader('Content-Length', String(contentLength));
      res.attachment(downloadFilename);

      if (typeof body.pipe === 'function') {
        body.once?.('error', (streamError) => {
          console.warn('[audio-download] cloud stream failed:', streamError?.message || streamError);
          if (!res.headersSent) next(streamError);
          else res.destroy(streamError);
        });
        body.pipe(res);
        return undefined;
      }

      if (typeof body.transformToByteArray === 'function') {
        const bytes = await body.transformToByteArray();
        return res.send(Buffer.from(bytes));
      }

      return res.status(503).json({
        error: {
          code: 'AUDIO_CLOUD_STREAM_UNAVAILABLE',
          message: 'The archived audio could not be streamed.',
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

    if (audio.mimeType) res.setHeader('Content-Type', audio.mimeType);

    return res.download(
      absolutePath,
      downloadFilename,
      (downloadError) => {
        if (downloadError && !res.headersSent) next(downloadError);
      }
    );
  } catch (error) {
    return next(error);
  }
}

export default downloadAuthorizedAudio;
