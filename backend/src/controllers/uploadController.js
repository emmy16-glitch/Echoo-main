import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Audio from '../models/Audio.js';
import UploadSession from '../models/UploadSession.js';
import User from '../models/User.js';
import { matchesUploadedFileSignature } from '../services/uploadMediaSignature.js';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio');
const TEMP_DIR = path.join(process.cwd(), 'uploads', 'temp');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_SIZE = Math.max(100 * 1024 * 1024, Number(process.env.MAX_AUDIO_UPLOAD_BYTES) || 2 * 1024 * 1024 * 1024);
const MAX_CHUNK_SIZE = Math.min(16 * 1024 * 1024, Math.max(1024 * 1024, Number(process.env.AUDIO_UPLOAD_CHUNK_BYTES) || 5 * 1024 * 1024));
const SESSION_TTL_MS = Math.max(60 * 60 * 1000, Number(process.env.AUDIO_UPLOAD_SESSION_TTL_MS) || 7 * 24 * 60 * 60 * 1000);
const ALLOWED_MIMES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/m4a', 'audio/webm']);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

const uploadPath = (id) => UUID_PATTERN.test(String(id || '')) ? path.join(TEMP_DIR, String(id)) : null;
const fail = (res, status, code, message, extra = {}) => res.status(status).json({ error: { code, message, ...extra } });
const remove = async (target) => fs.promises.unlink(target).catch((error) => { if (error?.code !== 'ENOENT') throw error; });

// Atomic filesystem lock stops parallel requests corrupting the same session.
async function lockUpload(uploadId) {
  const lockPath = uploadPath(uploadId) + '.lock';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.promises.open(lockPath, 'wx');
      return async () => { await handle.close(); await remove(lockPath); };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const stat = await fs.promises.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 3 * 60 * 1000) {
        await remove(lockPath);
        continue;
      }
      return null;
    }
  }
  return null;
}


async function ownedSession(id, userId) {
  if (!uploadPath(id)) return null;
  const session = await UploadSession.findOne({ uploadId: id });
  return String(session?.owner || '') === String(userId || '') ? session : null;
}

async function cleanupExpiredSessions() {
  const expired = await UploadSession.find({ expiresAt: { $lte: new Date() }, status: 'uploading' }).select('uploadId').limit(25);
  await Promise.all(expired.map(async ({ uploadId }) => {
    const unlock = await lockUpload(uploadId);
    if (!unlock) return;
    try {
      await remove(uploadPath(uploadId));
      await UploadSession.deleteOne({ uploadId });
    } finally { await unlock(); }
  }));
}

export async function initiateUpload(req, res, next) {
  try {
    cleanupExpiredSessions().catch(() => {});
    const filename = String(req.body.filename || '').trim();
    const fileSize = Number(req.body.fileSize);
    const mimeType = String(req.body.mimeType || '').toLowerCase();
    const fingerprint = String(req.body.fingerprint || '').toLowerCase();
    if (!filename || filename.length > 255 || !Number.isSafeInteger(fileSize) || fileSize <= 0 || !ALLOWED_MIMES.has(mimeType) || (fingerprint && !/^[a-f0-9]{64}$/.test(fingerprint))) {
      return fail(res, 400, 'VALIDATION_ERROR', 'A supported audio filename, size, and MIME type are required');
    }
    if (fileSize > MAX_UPLOAD_SIZE) return fail(res, 413, 'FILE_TOO_LARGE', `File exceeds the configured ${MAX_UPLOAD_SIZE} byte limit`);
    const resume = await UploadSession.findOne({ owner: req.userId, filename, fileSize, mimeType, fingerprint: fingerprint || null, status: 'uploading', expiresAt: { $gt: new Date() } }).sort({ updatedAt: -1 });
    if (resume && await fs.promises.stat(uploadPath(resume.uploadId)).catch(() => null)) {
      return res.status(200).json({ data: { ...resume.toObject(), resumed: true } });
    }
    const uploadId = randomUUID();
    await fs.promises.writeFile(uploadPath(uploadId), Buffer.alloc(0), { flag: 'wx' });
    const session = await UploadSession.create({ uploadId, owner: req.userId, filename, fileSize, mimeType, fingerprint: fingerprint || null, chunkSize: MAX_CHUNK_SIZE, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
    return res.status(201).json({ data: session.toObject() });
  } catch (error) { return next(error); }
}

export async function uploadChunk(req, res, next) {
  const chunkPath = req.file?.path;
  let unlock = null;
  try {
    const initial = await ownedSession(req.params.uploadId, req.userId);
    if (!initial) return fail(res, 404, 'UPLOAD_NOT_FOUND', 'Upload session not found');
    unlock = await lockUpload(initial.uploadId);
    if (!unlock) return fail(res, 423, 'UPLOAD_BUSY', 'Another upload request is still finishing');
    const session = await ownedSession(initial.uploadId, req.userId);
    if (!session || session.status !== 'uploading') return fail(res, 409, 'UPLOAD_NOT_ACTIVE', 'Upload is no longer active');
    if (!req.file || req.file.size <= 0) return fail(res, 400, 'NO_FILE', 'No file chunk uploaded');
    if (req.file.size > MAX_CHUNK_SIZE) return fail(res, 413, 'CHUNK_TOO_LARGE', 'Upload chunk exceeds the size limit');
    const offset = Number(req.get('Upload-Offset') ?? req.body.offset);
    if (!Number.isSafeInteger(offset) || offset !== session.offset) return fail(res, 409, 'OFFSET_MISMATCH', 'Chunk offset does not match confirmed server progress', { expectedOffset: session.offset });
    if (offset + req.file.size > session.fileSize) return fail(res, 400, 'UPLOAD_OVERFLOW', 'Chunk exceeds the declared file size');
    const checksum = String(req.get('Upload-Checksum') || '');
    if (!/^sha256 [a-f0-9]{64}$/i.test(checksum)) return fail(res, 400, 'CHECKSUM_REQUIRED', 'A SHA-256 chunk checksum is required');
    const data = await fs.promises.readFile(chunkPath);
    if (createHash('sha256').update(data).digest('hex') !== checksum.slice(7).toLowerCase()) return fail(res, 422, 'CHECKSUM_MISMATCH', 'Chunk integrity check failed');
    const handle = await fs.promises.open(uploadPath(session.uploadId), 'r+');
    try {
      // Discard unconfirmed bytes left by interrupted requests.
      await handle.truncate(session.offset);
      await handle.write(data, 0, data.length, offset);
    } finally { await handle.close(); }
    session.offset += data.length;
    session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await session.save();
    res.setHeader('Upload-Offset', String(session.offset));
    return res.status(204).end();
  } catch (error) { return next(error); }
  finally {
    if (unlock) await unlock();
    if (chunkPath) await remove(chunkPath).catch(() => {});
  }
}

export async function completeUpload(req, res, next) {
  let unlock = null;
  try {
    const initial = await ownedSession(req.params.uploadId || req.body.uploadId, req.userId);
    if (!initial) return fail(res, 404, 'UPLOAD_NOT_FOUND', 'Upload session not found');
    unlock = await lockUpload(initial.uploadId);
    if (!unlock) return fail(res, 423, 'UPLOAD_BUSY', 'Another upload request is still finishing');
    const session = await ownedSession(initial.uploadId, req.userId);
    if (!session) return fail(res, 404, 'UPLOAD_NOT_FOUND', 'Upload session not found');
    if (session.status === 'completed' && session.audio) {
      const audio = await Audio.findById(session.audio).populate('artist', 'username displayName avatar');
      return res.status(200).json({ data: { audio, idempotent: true } });
    }
    if (session.status !== 'uploading') return fail(res, 409, 'UPLOAD_NOT_ACTIVE', 'Upload session is not active');
    if (session.offset !== session.fileSize) return fail(res, 409, 'UPLOAD_INCOMPLETE', 'Every byte must be confirmed before finalization', { expectedOffset: session.fileSize, offset: session.offset });

    const coverArt = req.body.coverArt || null;
    if (coverArt && (typeof coverArt !== 'string' || coverArt.length > 7 * 1024 * 1024 || !/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(coverArt))) {
      return fail(res, 400, 'INVALID_COVER', 'Cover artwork must be JPG, PNG or WebP and under 5 MB');
    }

    const extension = path.extname(session.filename).slice(0, 10);
    const finalFilename = session.uploadId + extension;
    const finalPath = path.join(UPLOAD_DIR, finalFilename);
    const tempPath = uploadPath(session.uploadId);
    const [tempStat, finalStat] = await Promise.all([
      fs.promises.stat(tempPath).catch(() => null),
      fs.promises.stat(finalPath).catch(() => null),
    ]);
    if (tempStat?.size !== session.fileSize && finalStat?.size !== session.fileSize) return fail(res, 409, 'UPLOAD_INCOMPLETE', 'Uploaded file is incomplete');
    // Match the signature validation used by the normal audio upload route.
    const sourcePath = tempStat?.size === session.fileSize ? tempPath : finalPath;
    const source = await fs.promises.open(sourcePath, 'r');
    const header = Buffer.alloc(16);
    let bytesRead = 0;
    try { ({ bytesRead } = await source.read(header, 0, header.length, 0)); }
    finally { await source.close(); }
    if (!matchesUploadedFileSignature({ originalname: session.filename }, header.subarray(0, bytesRead))) {
      return fail(res, 415, 'INVALID_AUDIO_SIGNATURE', 'Audio file does not match its selected format');
    }
    if (tempStat?.size === session.fileSize) await fs.promises.rename(tempPath, finalPath);

    let audio = await Audio.findOne({ fileKey: finalFilename });
    if (!audio) {
      audio = new Audio({
        title: String(req.body.title || session.filename).trim(),
        description: String(req.body.description || '').trim(),
        artist: req.userId,
        filename: finalFilename,
        originalName: session.filename,
        fileSize: session.fileSize,
        fileUrl: '/uploads/audio/' + finalFilename,
        fileKey: finalFilename,
        mimeType: session.mimeType,
        duration: Math.max(0, Number(req.body.duration) || 0),
        genre: req.body.genre || 'Other',
        tags: Array.isArray(req.body.tags) ? req.body.tags : [],
        coverArt,
      });
      audio.setPublicPublication(req.body.isPublic);
      await audio.save();
    }

    // Retried finalization must not duplicate records or creator counters.
    await User.updateOne(
      { _id: req.userId, uploadedAudio: { $ne: audio._id } },
      { $addToSet: { uploadedAudio: audio._id }, $inc: { 'creatorProfile.totalTracks': 1 } }
    );
    session.status = 'completed';
    session.audio = audio._id;
    await session.save();
    await audio.populate('artist', 'username displayName avatar');
    return res.status(201).json({ data: { audio } });
  } catch (error) { return next(error); }
  finally { if (unlock) await unlock(); }
}

export async function getUploadStatus(req, res, next) {
  try {
    const session = await ownedSession(req.params.uploadId, req.userId);
    if (!session) return fail(res, 404, 'UPLOAD_NOT_FOUND', 'Upload session not found');
    res.setHeader('Upload-Offset', String(session.offset));
    return res.status(200).json({ data: session.toObject() });
  } catch (error) { return next(error); }
}

export async function cancelUpload(req, res, next) {
  try {
    const session = await ownedSession(req.params.uploadId, req.userId);
    if (!session) return fail(res, 404, 'UPLOAD_NOT_FOUND', 'Upload session not found');
    const unlock = await lockUpload(session.uploadId);
    if (!unlock) return fail(res, 423, 'UPLOAD_BUSY', 'Another upload request is still finishing');
    try {
      const current = await ownedSession(session.uploadId, req.userId);
      if (current.status === 'uploading') await remove(uploadPath(current.uploadId));
      if (current.status === 'uploading') { current.status = 'cancelled'; await current.save(); }
      return res.status(200).json({ data: { message: 'Upload cancelled' } });
    } finally { await unlock(); }
  } catch (error) { return next(error); }
}
