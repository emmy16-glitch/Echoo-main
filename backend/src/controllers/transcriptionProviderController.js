import mongoose from 'mongoose';
import Broadcast from '../models/Broadcast.js';
import TranscriptSegment from '../models/TranscriptSegment.js';
import TranscriptSession from '../models/TranscriptSession.js';
import { env } from '../config/env.js';
import { createGeminiLiveEphemeralToken, getGeminiDiagnostics } from '../services/transcription/geminiService.js';

const PROVIDERS = new Set(['parakeet', 'gemini-live']);

const httpError = (status, code, message) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const requireOwnedLiveBroadcast = async (broadcastId, userId) => {
  if (!mongoose.isValidObjectId(broadcastId)) throw httpError(400, 'INVALID_BROADCAST_ID', 'Invalid broadcast ID');
  const broadcast = await Broadcast.findOne({ _id: broadcastId, isDeleted: false })
    .select('_id creator status startedAt captionSettings');
  if (!broadcast) throw httpError(404, 'NOT_FOUND', 'Broadcast not found');
  if (String(broadcast.creator) !== String(userId)) {
    throw httpError(403, 'FORBIDDEN', 'Only the broadcast creator can manage live transcription');
  }
  if (!['starting', 'live', 'ending'].includes(broadcast.status)) {
    throw httpError(409, 'INVALID_STATE', 'This broadcast is not accepting live transcription');
  }
  return broadcast;
};

const providerModel = (provider) => provider === 'gemini-live'
  ? env.geminiLiveModel
  : 'parakeet-tdt-0.6b-v3';

export async function getTranscriptionProviderReadiness(req, res) {
  const gemini = getGeminiDiagnostics();
  return res.status(200).json({
    data: {
      parakeetEnabled: true,
      geminiLiveEnabled: gemini.liveEnabled,
      geminiQualityEnabled: gemini.qualityEnabled,
      whisperFallbackEnabled: Boolean(env.whisperFlowUrl),
      gemini: {
        configured: gemini.configured,
        liveEnabled: gemini.liveEnabled,
        qualityEnabled: gemini.qualityEnabled,
      },
    },
    timestamp: new Date().toISOString(),
  });
}

export async function createProviderTranscriptSession(req, res, next) {
  try {
    const broadcast = await requireOwnedLiveBroadcast(req.params.broadcastId, req.userId);
    const provider = String(req.body?.provider || '').trim();
    if (!PROVIDERS.has(provider)) {
      throw httpError(400, 'INVALID_PROVIDER', 'Unsupported browser transcription provider');
    }
    if (provider === 'gemini-live' && !(env.geminiLiveEnabled && env.geminiApiKey)) {
      throw httpError(503, 'GEMINI_LIVE_DISABLED', 'Gemini Live transcription is not configured');
    }

    const active = await TranscriptSession.findOne({
      broadcastId: broadcast._id,
      creatorId: req.userId,
      provider,
      state: { $in: ['starting', 'connecting', 'connected', 'reconnecting'] },
    }).sort({ createdAt: -1 });
    if (active) {
      return res.status(200).json({ data: { configured: true, session: active.toJSON() }, timestamp: new Date().toISOString() });
    }

    const latest = await TranscriptSegment.findOne({ broadcastId: broadcast._id })
      .sort({ endMs: -1, _id: -1 })
      .select('endMs');
    const wallClockOffset = broadcast.startedAt
      ? Math.max(0, Date.now() - new Date(broadcast.startedAt).getTime())
      : 0;
    const offsetMs = Math.max(Number(latest?.endMs) || 0, wallClockOffset);
    const now = new Date();
    const session = await TranscriptSession.create({
      broadcastId: broadcast._id,
      creatorId: req.userId,
      provider,
      model: providerModel(provider),
      state: 'connected',
      status: 'active',
      offsetMs,
      captureOffset: offsetMs,
      startedAt: now,
      connectedAt: now,
      lastActivityAt: now,
      language: String(req.body?.language || broadcast.captionSettings?.language || 'en').trim().slice(0, 16) || 'en',
    });
    await Broadcast.updateOne(
      { _id: broadcast._id, isDeleted: false },
      { $set: { transcriptState: 'connected', 'assetStatus.transcript': 'processing' } }
    );
    return res.status(201).json({ data: { configured: true, session: session.toJSON() }, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function flushProviderTranscriptSession(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.sessionId)) throw httpError(400, 'INVALID_SESSION_ID', 'Invalid session ID');
    const session = await TranscriptSession.findOne({
      _id: req.params.sessionId,
      creatorId: req.userId,
      provider: { $in: [...PROVIDERS] },
    });
    if (!session) throw httpError(404, 'NOT_FOUND', 'Provider transcript session not found');
    if (session.status !== 'completed') {
      session.state = 'completed';
      session.status = 'completed';
      session.endedAt = new Date();
      session.lastActivityAt = new Date();
      await session.save();
    }
    return res.status(200).json({ data: session.toJSON(), timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function createGeminiLiveToken(req, res, next) {
  try {
    await requireOwnedLiveBroadcast(req.params.broadcastId, req.userId);
    const data = await createGeminiLiveEphemeralToken();
    return res.status(201).json({ data, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export default {
  getTranscriptionProviderReadiness,
  createProviderTranscriptSession,
  flushProviderTranscriptSession,
  createGeminiLiveToken,
};
