import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import Broadcast from '../models/Broadcast.js';
import { listSealedServerRecordingSegments } from '../services/serverRecordingSegments.js';

const resolveFiles = async (req, res) => {
  const id = String(req.params.broadcastId || '');
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    res.status(400).json({ error: { code: 'INVALID_BROADCAST_ID', message: 'Invalid broadcast ID' } });
    return null;
  }
  const broadcast = await Broadcast.findOne({
    _id: id, creator: req.userId, isDeleted: false,
  }).select('_id serverRecording.segments');
  if (!broadcast) {
    res.status(404).json({ error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found' } });
    return null;
  }
  const state = broadcast.serverRecording?.segments || {};
  const files = await listSealedServerRecordingSegments({
    broadcastId: id, attemptId: state.attemptId, segmentStatus: state.status,
  });
  return { id, state, files };
};

export async function listRecordingRecoveryDownloads(req, res, next) {
  try {
    const record = await resolveFiles(req, res);
    if (!record) return;
    return res.set('Cache-Control', 'private, no-store').status(200).json({
      data: {
        broadcastId: record.id,
        availableSegments: record.files.length,
        segments: record.files.map(({ index, bytes }) => ({ index, bytes })),
      },
    });
  } catch (error) { next(error); }
}

export async function downloadRecordingRecoverySegment(req, res, next) {
  try {
    const text = String(req.params.index || '');
    if (!/^\d{1,6}$/.test(text) || Number(text) > 2047) {
      return res.status(400).json({ error: { code: 'INVALID_SEGMENT', message: 'Invalid segment' } });
    }
    const record = await resolveFiles(req, res);
    if (!record) return;
    const index = Number(text);
    if (!record.files.some(file => file.index === index)) {
      return res.status(404).json({
        error: { code: 'SEGMENT_NOT_SEALED', message: 'That recording segment is not safely closed.' },
      });
    }
    const name = 'part-' + String(index).padStart(6, '0') + '.mp3';
    const base = path.resolve(
      process.env.REPLAY_ARCHIVE_DIR || path.join(process.cwd(), 'uploads', 'replay'),
      'segments',
    );
    const filePath = path.join(base, record.id, record.state.attemptId, name);
    const info = await fs.lstat(filePath);
    if (!info.isFile() || info.size < 4096) {
      return res.status(404).json({
        error: { code: 'SEGMENT_MISSING', message: 'Recording segment unavailable.' },
      });
    }
    const handle = await fs.open(filePath, 'r');
    // Native server streaming: never allocate a 10-minute MP3 into Node memory.
    const stream = createReadStream(filePath, { fd: handle.fd, autoClose: true });
    const downloadName = 'echoo-' + record.id + '-part-' + (index + 1) + '.mp3';
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(info.size),
      'Content-Disposition': 'attachment; filename="' + downloadName + '"',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    });
    stream.once('error', error => {
      if (!res.headersSent) next(error);
      else res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) { next(error); }
}
