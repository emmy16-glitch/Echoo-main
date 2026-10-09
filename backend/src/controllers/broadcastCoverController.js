import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const COVER_DIRECTORY = path.join(process.cwd(), 'uploads', 'broadcast-covers');
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export const broadcastCoverSignatureMatches = (mimeType, bytes) => {
  if (!Buffer.isBuffer(bytes)) return false;
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF'
      && bytes.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
};

export async function uploadBroadcastCover(req, res, next) {
  try {
    const file = req.file;
    const extension = IMAGE_TYPES.get(String(file?.mimetype || '').toLowerCase());
    if (!file || !extension) {
      return res.status(400).json({
        error: {
          code: 'BROADCAST_COVER_REQUIRED',
          message: 'Choose a JPG, PNG or WebP Broadcast Cover before going live.',
        },
      });
    }

    if (!broadcastCoverSignatureMatches(file.mimetype, file.buffer)) {
      return res.status(415).json({
        error: {
          code: 'INVALID_BROADCAST_COVER',
          message: 'The selected file is not a valid JPG, PNG or WebP image.',
        },
      });
    }

    await mkdir(COVER_DIRECTORY, { recursive: true });
    const filename = `broadcast-${randomUUID()}.${extension}`;
    await writeFile(path.join(COVER_DIRECTORY, filename), file.buffer, { flag: 'wx' });

    return res.status(201).json({
      data: { coverArt: `/uploads/broadcast-covers/${filename}` },
      message: 'Broadcast Cover uploaded.',
    });
  } catch (error) {
    return next(error);
  }
}
