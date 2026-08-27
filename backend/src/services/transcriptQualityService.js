import fs from 'node:fs/promises';
import WebSocket from 'ws';
import BroadcastAudioChunk from '../models/BroadcastAudioChunk.js';
import TranscriptSegment from '../models/TranscriptSegment.js';
import { env } from '../config/env.js';
import { transcribeGeminiQuality } from './transcription/geminiService.js';

const SAMPLE_RATE = 16_000;
const FRAME_BYTES = SAMPLE_RATE * 0.02 * 2;
const READY_TIMEOUT_MS = 15_000;
const FLUSH_TIMEOUT_MS = 120_000;
const WHISPER_QUALITY_PROVIDER = 'whisper-flow-quality';
const GEMINI_QUALITY_PROVIDER = 'gemini-transcribe';

const providerUrl = () => String(
  process.env.WHISPER_QUALITY_FLOW_URL || process.env.WHISPER_FLOW_URL || ''
).trim();
const providerApiKey = () => String(
  process.env.WHISPER_QUALITY_FLOW_API_KEY || process.env.WHISPER_FLOW_API_KEY || process.env.WHISPER_FLOW_AUTH_TOKEN || ''
).trim();
const providerModel = () => String(
  process.env.WHISPER_QUALITY_MODEL || process.env.WHISPER_MODEL || 'faster-whisper-large-v3-turbo'
).trim() || 'faster-whisper-large-v3-turbo';
const providerLanguage = () => String(process.env.WHISPER_LANGUAGE || 'en').trim() || 'en';

const asRetryable = (error, fallback = 'Whisper quality provider is unavailable') => {
  const next = error instanceof Error ? error : new Error(String(error || fallback));
  next.retryable = true;
  return next;
};

const parseWav = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Quality chunk is not a valid RIFF/WAVE file');
  }
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ' && size >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    }
    if (id === 'data') data = buffer.subarray(start, Math.min(buffer.length, start + size));
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.audioFormat !== 1 || ![1, 2].includes(format.channels) || ![16, 24, 32].includes(format.bitsPerSample)) {
    throw new Error('Quality chunk must contain PCM mono or stereo audio');
  }
  return { ...format, data };
};

const sampleFromPcm = (buffer, offset, bits) => {
  if (bits === 16) return buffer.readInt16LE(offset) / 32768;
  if (bits === 24) {
    let value = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
    if (value & 0x800000) value -= 0x1000000;
    return value / 8388608;
  }
  return buffer.readInt32LE(offset) / 2147483648;
};

const wavToPcm16Mono16k = (buffer) => {
  const wav = parseWav(buffer);
  const bytesPerSample = wav.bitsPerSample / 8;
  const sourceFrames = Math.floor(wav.data.length / (bytesPerSample * wav.channels));
  if (!sourceFrames) throw new Error('Quality chunk contains no PCM samples');
  const targetFrames = Math.max(1, Math.round(sourceFrames * SAMPLE_RATE / wav.sampleRate));
  const mono = new Float32Array(sourceFrames);
  for (let frame = 0; frame < sourceFrames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < wav.channels; channel += 1) {
      sum += sampleFromPcm(wav.data, (frame * wav.channels + channel) * bytesPerSample, wav.bitsPerSample);
    }
    mono[frame] = sum / wav.channels;
  }
  const output = Buffer.alloc(targetFrames * 2);
  for (let index = 0; index < targetFrames; index += 1) {
    const sourcePosition = index * (sourceFrames - 1) / Math.max(1, targetFrames - 1);
    const left = Math.floor(sourcePosition);
    const right = Math.min(sourceFrames - 1, left + 1);
    const ratio = sourcePosition - left;
    const sample = Math.max(-1, Math.min(1, mono[left] * (1 - ratio) + mono[right] * ratio));
    output.writeInt16LE(Math.round(sample * (sample < 0 ? 32768 : 32767)), index * 2);
  }
  return output;
};

const parseSegment = (value) => {
  const text = String(value?.text || value?.transcript || '').trim();
  if (!text) return null;
  const startMs = Number(value?.startTimeMs ?? value?.start_time ?? value?.start ?? 0);
  const endMs = Number(value?.endTimeMs ?? value?.end_time ?? value?.end ?? startMs);
  const confidence = Number(value?.confidence ?? value?.probability);
  return {
    text,
    startMs: Math.max(0, Math.round(Number.isFinite(startMs) ? startMs : 0)),
    endMs: Math.max(0, Math.round(Number.isFinite(endMs) ? endMs : startMs)),
    speaker: String(value?.speaker || 'Creator').trim().slice(0, 120) || 'Creator',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
    language: String(value?.language || providerLanguage()).trim().slice(0, 16) || providerLanguage(),
  };
};

const transcribeWhisperChunk = async ({ chunk, pcm }) => {
  const url = providerUrl();
  const apiKey = providerApiKey();
  if (!url || !apiKey) throw asRetryable(new Error('Whisper quality provider is not configured'));

  const sessionId = `quality-${String(chunk._id)}`;
  const segments = [];
  let provider = null;
  let ready = false;
  let flushed = false;
  let resolveFlush;
  let rejectFlush;
  const flushPromise = new Promise((resolve, reject) => {
    resolveFlush = resolve;
    rejectFlush = reject;
  });
  const close = () => {
    try { provider?.close(1000, 'quality-chunk-complete'); } catch { /* already closed */ }
  };

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(asRetryable(error));
        else resolve(true);
      };
      const timer = setTimeout(
        () => finish(new Error('Whisper quality provider did not become ready in time')),
        READY_TIMEOUT_MS
      );
      const options = { handshakeTimeout: READY_TIMEOUT_MS, maxPayload: 1024 * 1024 };
      options.headers = { Authorization: `Bearer ${apiKey}` };
      provider = new WebSocket(url, options);
      provider.once('open', () => {
        provider.send(JSON.stringify({
          type: 'start',
          broadcastId: String(chunk.broadcastId),
          sessionId,
          model: providerModel(),
          language: providerLanguage(),
          sampleRate: SAMPLE_RATE,
          channels: 1,
          encoding: 'pcm_s16le',
          qualityPass: true,
          inlineQuality: false,
        }));
      });
      provider.on('message', (raw) => {
        let value;
        try { value = JSON.parse(String(raw)); } catch { return; }
        if (value.type === 'ready') {
          ready = true;
          finish();
        } else if (value.type === 'segment') {
          const parsed = parseSegment(value);
          if (parsed) segments.push(parsed);
        } else if (value.type === 'flushed') {
          flushed = true;
          resolveFlush(value);
        }
      });
      provider.once('error', (error) => {
        if (!ready) finish(error);
        else rejectFlush(asRetryable(error));
      });
      provider.once('close', (code, reason) => {
        const message = `Whisper quality provider closed before completion (${code}${reason?.length ? `: ${String(reason)}` : ''})`;
        if (!ready) finish(new Error(message));
        else if (!flushed) rejectFlush(asRetryable(new Error(message)));
      });
    });

    const frameCount = Math.ceil(pcm.length / FRAME_BYTES);
    for (let index = 0; index < frameCount; index += 1) {
      const start = index * FRAME_BYTES;
      const available = pcm.subarray(start, Math.min(pcm.length, start + FRAME_BYTES));
      const frame = available.length === FRAME_BYTES
        ? available
        : Buffer.concat([available, Buffer.alloc(FRAME_BYTES - available.length)]);
      provider.send(JSON.stringify({
        type: 'audio',
        broadcastId: String(chunk.broadcastId),
        sessionId,
        sequence: index,
        timestamp: Number(chunk.startMs) + index * 20,
        audioChunk: frame.toString('base64'),
      }));
    }
    provider.send(JSON.stringify({
      type: 'flush',
      broadcastId: String(chunk.broadcastId),
      sessionId,
      reason: 'quality-chunk-complete',
      lastSequence: frameCount - 1,
    }));
    await Promise.race([
      flushPromise,
      new Promise((_, reject) => setTimeout(
        () => reject(asRetryable(new Error('Whisper quality chunk flush timed out'))),
        FLUSH_TIMEOUT_MS
      )),
    ]);
    return segments;
  } finally {
    close();
  }
};

const overlapDuration = (left, right) =>
  Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));

const overlapScore = (left, right) => {
  const overlap = overlapDuration(left, right);
  const union = Math.max(left.endMs, right.endMs) - Math.min(left.startMs, right.startMs);
  return union ? overlap / union : 0;
};

const reconcileSegments = async ({ chunk, qualitySegments, qualityProvider }) => {
  const drafts = await TranscriptSegment.find({
    broadcastId: chunk.broadcastId,
    isFinal: true,
    publicationStatus: 'draft',
    startMs: { $lt: chunk.endMs + 1200 },
    endMs: { $gt: Math.max(0, chunk.startMs - 1200) },
  }).sort({ startMs: 1 });

  const claimedDraftIds = new Set();
  let updated = 0;
  let created = 0;
  let hidden = 0;

  for (let index = 0; index < qualitySegments.length; index += 1) {
    const quality = qualitySegments[index];
    const qualityStart = Math.min(chunk.endMs, Math.max(chunk.startMs, quality.startMs));
    const qualityEnd = Math.min(chunk.endMs, Math.max(qualityStart, quality.endMs));
    const marker = `${chunk._id}:${index}`;
    const existingQuality = await TranscriptSegment.findOne({
      broadcastId: chunk.broadcastId,
      qualityChunkId: chunk._id,
      qualitySegmentIndex: index,
    });

    const draft = drafts
      .filter((candidate) => (
        !candidate.qualityChunkId &&
        !candidate.isHidden &&
        !claimedDraftIds.has(String(candidate._id))
      ))
      .map((candidate) => ({
        candidate,
        score: overlapScore({ startMs: qualityStart, endMs: qualityEnd }, candidate),
      }))
      .sort((a, b) => b.score - a.score)[0];

    const target = existingQuality || (draft?.score >= 0.18 ? draft.candidate : null);
    const now = new Date();

    if (existingQuality) {
      claimedDraftIds.add(String(existingQuality._id));
    } else if (target) {
      claimedDraftIds.add(String(target._id));
      const previousText = String(target.text || '').trim();
      const creatorEdited = Boolean(target.correctedAt || target.editedText);
      const nextRevision = Number(target.revisionNumber || target.revision || 1) + 1;
      const history = [...(target.qualityHistory || []), {
        text: quality.text,
        speaker: quality.speaker,
        startMs: qualityStart,
        endMs: qualityEnd,
        confidence: quality.confidence,
        revision: nextRevision,
        processedBy: qualityProvider,
        processedAt: now,
      }].slice(-20);
      const update = {
        originalText: target.originalText || previousText,
        qualityHistory: history,
        processedBy: qualityProvider,
        processedAt: now,
        qualityChunkId: chunk._id,
        qualitySegmentIndex: index,
        confidence: quality.confidence ?? target.confidence,
        revisionNumber: nextRevision,
        isHidden: false,
      };
      if (!creatorEdited) {
        update.text = quality.text;
        update.speaker = quality.speaker;
        update.startMs = qualityStart;
        update.endMs = qualityEnd;
        update.provider = qualityProvider;
        update.language = quality.language;
        update.revision = Number(target.revision || 1) + 1;
      }
      await TranscriptSegment.updateOne({ _id: target._id }, { $set: update });
      updated += 1;
    } else {
      const createdSegment = await TranscriptSegment.findOneAndUpdate(
        { broadcastId: chunk.broadcastId, qualityChunkId: chunk._id, qualitySegmentIndex: index },
        {
          $setOnInsert: {
            audioId: null,
            sessionId: null,
            providerSegmentId: `quality-${marker}`,
            sequence: Number(chunk.chunkIndex) * 100000 + index,
            startMs: qualityStart,
            endMs: qualityEnd,
            speaker: quality.speaker,
            sourceType: 'final_mix',
            sourceLabel: 'Echoo quality pass',
            text: quality.text,
            originalText: quality.text,
            confidence: quality.confidence,
            providerRevision: 1,
            provider: qualityProvider,
            language: quality.language,
            isFinal: true,
            status: 'final',
            publicationStatus: 'draft',
            revision: 1,
            revisionNumber: 1,
            processedBy: qualityProvider,
            processedAt: now,
            qualityChunkId: chunk._id,
            qualitySegmentIndex: index,
            isHidden: false,
            qualityHistory: [{
              text: quality.text,
              speaker: quality.speaker,
              startMs: qualityStart,
              endMs: qualityEnd,
              confidence: quality.confidence,
              revision: 1,
              processedBy: qualityProvider,
              processedAt: now,
            }],
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      claimedDraftIds.add(String(createdSegment._id));
      created += 1;
    }

    const superseded = drafts.filter((candidate) => {
      if (candidate.isHidden || candidate.qualityChunkId || candidate.correctedAt || candidate.editedText) return false;
      if (claimedDraftIds.has(String(candidate._id))) return false;
      const duration = Math.max(1, Number(candidate.endMs) - Number(candidate.startMs));
      return overlapDuration({ startMs: qualityStart, endMs: qualityEnd }, candidate) / duration >= 0.6;
    });
    if (superseded.length) {
      await TranscriptSegment.updateMany(
        { _id: { $in: superseded.map((candidate) => candidate._id) } },
        { $set: { isHidden: true } }
      );
      for (const candidate of superseded) candidate.isHidden = true;
      hidden += superseded.length;
    }
  }
  return { updated, created, hidden, segments: qualitySegments.length, provider: qualityProvider };
};

const originalDraftTextForChunk = async (chunk) => {
  const rows = await TranscriptSegment.find({
    broadcastId: chunk.broadcastId,
    isFinal: true,
    isHidden: false,
    startMs: { $lt: chunk.endMs + 500 },
    endMs: { $gt: Math.max(0, chunk.startMs - 500) },
  }).sort({ startMs: 1 }).select('text originalText');
  return rows
    .map((row) => String(row.originalText || row.text || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
};

const transcribeWithConfiguredQualityProvider = async ({ chunk, wavBuffer, pcm }) => {
  if (env.geminiQualityEnabled && env.geminiApiKey) {
    const originalText = await originalDraftTextForChunk(chunk);
    try {
      const result = await transcribeGeminiQuality({
        audio: wavBuffer,
        mimeType: 'audio/wav',
        originalText,
        customVocabulary: [],
      });
      if (result.accepted && result.qualityText) {
        return {
          provider: GEMINI_QUALITY_PROVIDER,
          segments: [{
            text: result.qualityText,
            startMs: Number(chunk.startMs) || 0,
            endMs: Math.max(Number(chunk.startMs) || 0, Number(chunk.endMs) || Number(chunk.startMs) || 0),
            speaker: 'Creator',
            confidence: null,
            language: providerLanguage(),
          }],
          validation: result.reason,
        };
      }
      // A rejected candidate is not a provider failure. Preserve the raw live
      // transcript and finish the durable chunk without destructive rewriting.
      return { provider: GEMINI_QUALITY_PROVIDER, segments: [], preserveRaw: true, validation: result.reason };
    } catch (error) {
      if (providerUrl() && providerApiKey()) {
        console.warn('[Echoo Transcript] Gemini quality unavailable; falling back to Whisper quality', {
          chunkId: String(chunk._id),
          code: error?.code || error?.status || 'GEMINI_QUALITY_FAILED',
        });
      } else if (originalText) {
        return { provider: 'raw-live-transcript', segments: [], preserveRaw: true, fallbackReason: error?.code || 'gemini_failed' };
      } else {
        throw error;
      }
    }
  }

  if (providerUrl() && providerApiKey()) {
    return {
      provider: WHISPER_QUALITY_PROVIDER,
      segments: await transcribeWhisperChunk({ chunk, pcm }),
    };
  }

  const originalText = await originalDraftTextForChunk(chunk);
  if (originalText) {
    return { provider: 'raw-live-transcript', segments: [], preserveRaw: true, fallbackReason: 'no_quality_provider' };
  }
  throw asRetryable(new Error('No transcript quality provider is configured and no raw transcript is available'));
};

export async function processTranscriptQualityChunk(chunkId) {
  const chunk = await BroadcastAudioChunk.findById(chunkId);
  if (!chunk) throw new Error('Transcript quality chunk not found');

  if (chunk.status === 'completed') {
    await fs.rm(chunk.filePath, { force: true }).catch(() => null);
    return { updated: 0, created: 0, hidden: 0, segments: 0, recovered: true, chunkId: String(chunk._id) };
  }

  const buffer = await fs.readFile(chunk.filePath);
  const pcm = wavToPcm16Mono16k(buffer);
  const quality = await transcribeWithConfiguredQualityProvider({ chunk, wavBuffer: buffer, pcm });

  const summary = quality.segments.length
    ? await reconcileSegments({ chunk, qualitySegments: quality.segments, qualityProvider: quality.provider })
    : {
        updated: 0,
        created: 0,
        hidden: 0,
        segments: 0,
        silent: !quality.preserveRaw,
        preservedRaw: Boolean(quality.preserveRaw),
        provider: quality.provider,
        validation: quality.validation || null,
        fallbackReason: quality.fallbackReason || null,
      };

  chunk.status = 'completed';
  chunk.error = null;
  chunk.processedAt = new Date();
  await chunk.save();
  await fs.rm(chunk.filePath, { force: true }).catch(() => null);
  return { ...summary, chunkId: String(chunk._id) };
}

export async function markTranscriptQualityChunkFailed(chunkId, error) {
  await BroadcastAudioChunk.updateOne(
    { _id: chunkId },
    { $set: { status: 'failed', error: String(error?.message || error).slice(0, 2000) } }
  );
}
