import Broadcast from '../models/Broadcast.js';
import Audio from '../models/Audio.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { reconstructServerRecordingFromSegments } from './serverRecordingReconstruction.js';
import BroadcastProcessingJob from '../models/BroadcastProcessingJob.js';
import BroadcastAudioChunk from '../models/BroadcastAudioChunk.js';
import Notification from '../models/Notification.js';
import TranscriptSegment from '../models/TranscriptSegment.js';
import TranscriptSession from '../models/TranscriptSession.js';
import { flushBroadcastTranscription, isTranscriptionConfigured } from './transcriptionGateway.js';
import {
  markTranscriptQualityChunkFailed,
  processTranscriptQualityChunk,
} from './transcriptQualityService.js';
import { finalizeBroadcastReplay } from './broadcastReplayService.js';

const JOB_TYPES = [
  'audio_finalization',
  'transcript_completion',
  'transcript_improvement',
  'highlight_detection',
  'chapter_generation',
];
const POLL_MS = 1500;
const RETRY_MS = 5000;
let workerTimer = null;
let socketServer = null;
let workerBusy = false;

const retryable = (message) => Object.assign(new Error(message), { retryable: true });
const waiting = (message) => Object.assign(new Error(message), {
  retryable: true,
  waiting: true,
});

const emitProcessing = async (broadcastId) => {
  if (!socketServer) return;
  const [broadcast, jobs] = await Promise.all([
    Broadcast.findById(broadcastId).select('assetStatus assetVisibility processingStartedAt processingCompletedAt replayAudio'),
    BroadcastProcessingJob.find({ broadcastId }).sort({ createdAt: 1 }),
  ]);
  socketServer.to(`broadcast:${broadcastId}:creator`).emit('broadcast:processing', {
    broadcastId: String(broadcastId),
    assetStatus: broadcast?.assetStatus || null,
    assetVisibility: broadcast?.assetVisibility || null,
    replayAudioId: broadcast?.replayAudio || null,
    jobs,
  });
};

export async function enqueueBroadcastProcessing(broadcastId, { transcriptionEnabled = true } = {}) {
  const now = new Date();
  const jobs = transcriptionEnabled ? JOB_TYPES : ['audio_finalization'];

  for (const jobType of jobs) {
    await BroadcastProcessingJob.updateOne(
      { broadcastId, jobType },
      { $setOnInsert: { broadcastId, jobType, status: 'queued', progress: 0, availableAt: now } },
      { upsert: true }
    );
  }

  await Broadcast.updateOne({ _id: broadcastId }, {
    $set: {
      processingStartedAt: now,
      processingCompletedAt: null,
      'assetStatus.audio': 'processing',
      'assetStatus.transcript': transcriptionEnabled ? 'processing' : 'disabled',
      'assetStatus.highlights': transcriptionEnabled ? 'pending' : 'failed',
      'assetStatus.chapters': transcriptionEnabled ? 'pending' : 'failed',
    },
  });
  await emitProcessing(broadcastId);
}

// Recover an already-linked private replay whose physical MP3 vanished after
// a storage event. An existing Audio row is not proof that playable bytes
// survived; this repair runs only in the post-broadcast processing worker.
export async function restoreLinkedRecordingIfMissing(broadcast) {
  const id = broadcast.replayAudioId || broadcast.replayAudio;
  if (!id) return false;
  const audio = await Audio.findById(id);
  if (!audio || audio.isDeleted) throw waiting('Waiting for missing audio record recovery');
  if (audio.storage === 'cloud' && audio.cloudKey) return true;
  const name = path.basename(String(audio.filename || ''));
  if (!name || !/^replay-[a-f0-9]{24}(?:-[a-f0-9-]+)?\.mp3$/i.test(name)) {
    throw waiting('Replay storage needs recovery; cannot safely restore an unexpected filename');
  }
  const destination = path.join(process.cwd(), 'uploads', 'audio', name);
  const stat = await fs.stat(destination).catch(() => null);
  if (stat?.isFile() && stat.size >= Math.max(4096, Number(audio.fileSize) || 0)) return true;
  const state = broadcast.serverRecording?.segments;
  if (!state?.attemptId || !['completed', 'failed'].includes(broadcast.status)) {
    throw waiting('Saved MP3 unavailable; server backup is required for recovery');
  }
  const start = new Date(broadcast.serverRecording?.startedAt || broadcast.startedAt || 0).getTime();
  const ended = new Date(broadcast.endedAt || broadcast.serverRecording?.endedAt || 0).getTime();
  const expectedDurationSeconds = start > 0 && ended > start ? (ended - start) / 1000 : 0;
  const rebuilt = await reconstructServerRecordingFromSegments({
    broadcastId: String(broadcast._id), attemptId: state.attemptId,
    segmentStatus: state.status, completedSegments: state.completedSegments,
    segmentSeconds: state.segmentSeconds || 600,
    expectedDurationSeconds, outputPath: destination,
  });
  if (rebuilt.status !== 'ready') {
    throw waiting('Saved replay missing; backup reconstruction requires more audio: ' +
      String(rebuilt.reason || 'incomplete'));
  }
  const restored = await fs.stat(destination);
  audio.fileSize = restored.size;
  audio.duration = rebuilt.duration;
  await audio.save();
  await Broadcast.updateOne({ _id: broadcast._id }, {
    $set: { replayStatus: 'ready',
      'serverRecording.segments.recoveryStatus': 'ready',
      'serverRecording.segments.recoveryError': null },
  });
  return true;
}

const completeAudio = async (broadcast) => {
  if (broadcast.replayAudio || broadcast.replayAudioId) {
    await restoreLinkedRecordingIfMissing(broadcast);
  } else {
    const replay = await finalizeBroadcastReplay({
      broadcastId: String(broadcast._id),
      creatorId: String(broadcast.creator || ''),
      expectedChunkCount: Number(broadcast.qualityChunkCount) || 0,
      uploadErrors: Number(broadcast.qualityChunkUploadErrors) || 0,
    });

    if (replay?.status !== 'ready' || !replay?.audioId) {
      throw waiting(
        replay?.status === 'incomplete'
          ? 'Waiting for browser recovery chunks because server recording was incomplete'
          : 'Waiting for the server recording to finish'
      );
    }

    broadcast.replayAudio = replay.audioId;
    broadcast.replayAudioId = replay.audioId;
  }

  broadcast.assetStatus.audio = 'ready';
  await broadcast.save();
};

const completeTranscript = async (broadcast) => {
  if (!isTranscriptionConfigured()) return;
  if (broadcast.assetStatus?.transcript === 'published') return;

  const [qualityPending, qualityFailed] = await Promise.all([
    BroadcastProcessingJob.countDocuments({
      broadcastId: broadcast._id,
      jobType: 'transcript_quality_chunk',
      status: { $in: ['queued', 'processing'] },
    }),
    BroadcastProcessingJob.countDocuments({
      broadcastId: broadcast._id,
      jobType: 'transcript_quality_chunk',
      status: 'failed',
    }),
  ]);
  if (qualityPending) {
    throw waiting(`Waiting for ${qualityPending} transcript quality chunk job(s)`);
  }

  if (broadcast.qualityChunkingStartedAt && !broadcast.qualityChunkingCompletedAt) {
    throw waiting('Waiting for the browser to close live quality chunking');
  }
  if (qualityFailed) throw new Error(`${qualityFailed} transcript quality chunk job(s) failed`);
  if (Number(broadcast.qualityChunkUploadErrors) > 0) {
    throw new Error(`${broadcast.qualityChunkUploadErrors} live quality chunk upload(s) were not recovered`);
  }

  // The gateway intentionally uses allSettled so one provider session cannot
  // abort cleanup of its siblings. Review readiness must therefore verify the
  // durable session records after the flush rather than trusting that helper's
  // summary alone.
  await flushBroadcastTranscription(broadcast._id);

  const [unfinishedSessions, failedSessions] = await Promise.all([
    TranscriptSession.countDocuments({
      broadcastId: broadcast._id,
      state: { $in: ['starting', 'connecting', 'connected', 'reconnecting', 'flushing'] },
    }),
    TranscriptSession.countDocuments({
      broadcastId: broadcast._id,
      state: { $in: ['failed', 'abandoned'] },
    }),
  ]);

  if (unfinishedSessions) {
    throw waiting(`Waiting for ${unfinishedSessions} transcript session(s) to finish finalization`);
  }

  // Durable post-master quality chunks are the authoritative recovery path.
  // Without them, a failed/abandoned live session means audio frames were lost
  // and the transcript must not be presented as review-complete.
  if (!broadcast.qualityChunkingStartedAt && failedSessions) {
    throw new Error(`${failedSessions} live transcript session(s) failed without a durable quality recording path`);
  }

  await Broadcast.updateOne(
    { _id: broadcast._id, 'assetStatus.transcript': { $ne: 'published' } },
    { $set: { transcriptState: 'completed' } }
  );
};

const processQualityChunk = async (job) => {
  if (!isTranscriptionConfigured()) return { disabled: true, chunkId: String(job.chunkId || '') };
  if (!job.chunkId) throw new Error('Transcript quality job is missing chunkId');
  await BroadcastAudioChunk.updateOne(
    { _id: job.chunkId, status: { $ne: 'completed' } },
    { $set: { status: 'processing', error: null }, $inc: { attempts: 1 } }
  );
  try {
    return await processTranscriptQualityChunk(job.chunkId);
  } catch (error) {
    await BroadcastAudioChunk.updateOne(
      { _id: job.chunkId, status: { $ne: 'completed' } },
      { $set: { status: error?.retryable ? 'pending' : 'failed', error: String(error?.message || error).slice(0, 2000) } }
    ).catch(() => null);
    throw error;
  }
};

const improveTranscript = async (broadcast) => {
  if (!isTranscriptionConfigured()) return;
  if (broadcast.assetStatus?.transcript === 'published') return;

  const completionJob = await BroadcastProcessingJob.findOne({
    broadcastId: broadcast._id,
    jobType: 'transcript_completion',
  }).select('status error');

  if (completionJob?.status === 'failed') {
    throw new Error(completionJob.error || 'Background transcript completion failed');
  }
  if (completionJob?.status !== 'completed') {
    throw waiting('Waiting for background transcript quality verification');
  }

  await TranscriptSegment.updateMany(
    { broadcastId: broadcast._id, isFinal: true, originalText: '' },
    [{ $set: { originalText: '$text' } }]
  );

  const result = await Broadcast.updateOne(
    { _id: broadcast._id, 'assetStatus.transcript': 'processing' },
    {
      $set: {
        'assetStatus.transcript': 'ready_for_review',
        transcriptState: 'completed',
      },
    }
  );

  if (!result.modifiedCount) return;

  await Notification.create({
    userId: broadcast.creator,
    type: 'transcript_ready',
    title: 'Your transcript is ready',
    message: `Review and publish the transcript for “${broadcast.title}”.`,
    link: `/creator/broadcasts/${broadcast._id}/processing`,
    metadata: { broadcastId: String(broadcast._id), asset: 'transcript' },
  });
};

const ensureTranscriptUsable = (broadcast, purpose) => {
  if (broadcast.assetStatus?.transcript === 'failed') {
    throw new Error(`Cannot ${purpose} because transcript processing failed`);
  }
  if (!['ready_for_review', 'editing', 'published'].includes(broadcast.assetStatus?.transcript)) {
    throw waiting(`Waiting for transcript review draft before ${purpose}`);
  }
};

const detectHighlights = async (broadcast) => {
  if (!isTranscriptionConfigured()) return;
  ensureTranscriptUsable(broadcast, 'detecting highlights');
  broadcast.assetStatus.highlights = 'processing';
  const candidates = await TranscriptSegment.find({
    broadcastId: broadcast._id,
    isFinal: true,
    isHidden: false,
  }).sort({ confidence: -1, startMs: 1 }).limit(5);
  broadcast.generatedHighlights = candidates.map((segment) => ({
    segmentId: segment._id,
    startMs: segment.startMs,
    text: segment.text,
  }));
  broadcast.assetStatus.highlights = 'ready';
  await broadcast.save();
};

const generateChapters = async (broadcast) => {
  if (!isTranscriptionConfigured()) return;
  ensureTranscriptUsable(broadcast, 'generating chapters');
  broadcast.assetStatus.chapters = 'processing';
  const segments = await TranscriptSegment.find({ broadcastId: broadcast._id, isFinal: true, isHidden: false })
    .sort({ startMs: 1 });
  const groups = new Map();
  for (const segment of segments) {
    const bucket = Math.floor(segment.startMs / 600000);
    const list = groups.get(bucket) || [];
    list.push(segment);
    groups.set(bucket, list);
  }
  broadcast.generatedChapters = [...groups.entries()].map(([bucket, rows], index) => ({
    title: index === 0 ? 'Introduction' : `Part ${index + 1}`,
    startMs: rows[0].startMs,
    endMs: rows[rows.length - 1].endMs,
    segmentIds: rows.map((row) => row._id),
  }));
  broadcast.assetStatus.chapters = 'ready';
  await broadcast.save();
};

const handlers = {
  audio_finalization: completeAudio,
  transcript_completion: completeTranscript,
  transcript_improvement: improveTranscript,
  transcript_quality_chunk: processQualityChunk,
  highlight_detection: detectHighlights,
  chapter_generation: generateChapters,
};

const finishBroadcastProcessingIfReady = async (broadcastId) => {
  const remaining = await BroadcastProcessingJob.countDocuments({
    broadcastId,
    status: { $in: ['queued', 'processing'] },
  });
  if (!remaining) {
    await Broadcast.updateOne(
      { _id: broadcastId },
      { $set: { processingCompletedAt: new Date() } }
    );
  }
};

export async function markBroadcastReplayDiscarded(broadcastId) {
  const now = new Date();
  await Broadcast.updateOne(
    { _id: broadcastId, replayAudio: null },
    {
      $set: {
        'assetStatus.audio': 'failed',
        'assetVisibility.audio': 'private',
      },
    }
  );
  await BroadcastProcessingJob.updateOne(
    {
      broadcastId,
      jobType: 'audio_finalization',
      status: { $in: ['queued', 'processing'] },
    },
    {
      $set: {
        status: 'failed',
        progress: 100,
        completedAt: now,
        error: 'Creator discarded the local replay recording',
      },
    }
  );
  await finishBroadcastProcessingIfReady(broadcastId);
  await emitProcessing(broadcastId);
}

async function processNextJob() {
  if (workerBusy) return;
  workerBusy = true;
  let job = null;
  try {
    job = await BroadcastProcessingJob.findOneAndUpdate(
      { status: 'queued', availableAt: { $lte: new Date() } },
      { $set: { status: 'processing', startedAt: new Date(), error: null }, $inc: { attempts: 1 } },
      { sort: { availableAt: 1, createdAt: 1 }, returnDocument: 'after' }
    );
    if (!job) return;
    const broadcast = await Broadcast.findById(job.broadcastId);
    if (!broadcast) throw new Error('Broadcast no longer exists');
    await handlers[job.jobType](job.jobType === 'transcript_quality_chunk' ? job : broadcast);
    job.status = 'completed';
    job.progress = 100;
    job.completedAt = new Date();
    await job.save();
    await finishBroadcastProcessingIfReady(job.broadcastId);
  } catch (error) {
    if (job) {
      const prerequisiteWait = Boolean(error?.waiting);
      const canRetry = prerequisiteWait || (error?.retryable && job.attempts < job.maxAttempts);
      job.status = canRetry ? 'queued' : 'failed';
      job.availableAt = new Date(Date.now() + RETRY_MS);
      job.error = String(error?.message || error).slice(0, 2000);
      if (prerequisiteWait) {
        job.attempts = Math.max(0, Number(job.attempts || 0) - 1);
      }
      if (!canRetry) job.completedAt = new Date();
      await job.save().catch(() => null);
      if (!canRetry) {
        if (job.jobType === 'transcript_quality_chunk') {
          await markTranscriptQualityChunkFailed(job.chunkId, error).catch(() => null);
        }
        const field = job.jobType === 'audio_finalization'
          ? 'assetStatus.audio'
          : job.jobType === 'transcript_completion' || job.jobType === 'transcript_improvement' || job.jobType === 'transcript_quality_chunk'
            ? 'assetStatus.transcript'
            : job.jobType === 'highlight_detection'
              ? 'assetStatus.highlights'
              : 'assetStatus.chapters';
        const terminalValue = field === 'assetStatus.transcript' ? 'published' : 'ready';
        await Broadcast.updateOne(
          { _id: job.broadcastId, [field]: { $ne: terminalValue } },
          { $set: { [field]: 'failed' } }
        ).catch(() => null);
        await finishBroadcastProcessingIfReady(job.broadcastId).catch(() => null);
      }
    }
  } finally {
    if (job) await emitProcessing(job.broadcastId).catch(() => null);
    workerBusy = false;
  }
}

// A server crash can occur after End Broadcast commits status=completed but
// before it inserts the audio_finalization job. Recover those lost enqueue
// operations from durable recording metadata on service restart.
const REPLAY_REPAIR_BATCH = 200;
const REPLAY_REPAIR_INTERVAL_MS = 60_000;
const REPLAY_FAILED_RETRY_MS = 30 * 60_000;
let replayRepairCursor = null;
let replayRepairTimer = null;
let replayRepairRunning = false;

export const eligibleFailedReplayJob = (job, nowMs = Date.now()) => {
  if (!job || job.status !== 'failed') return false;
  const attempts = Number(job.attempts || 0);
  const limit = Math.max(1, Number(job.maxAttempts) || 60);
  if (attempts >= limit) return false;
  const when = new Date(job.completedAt || job.updatedAt || 0).getTime();
  return Number.isFinite(when) && when > 0 &&
    nowMs - when >= REPLAY_FAILED_RETRY_MS;
};

// Scan the unfinished archive in bounded pages, continuing where the prior
// sweep stopped. Neither a 200-row cap nor a crash after a lost enqueue may
// permanently strand another creator's already-recorded audio.
export async function requeueMissingRecordingFinalizations() {
  if (replayRepairRunning) return 0;
  replayRepairRunning = true;
  let requeued = 0;
  try {
    const query = {
      status: { $in: ['completed', 'failed'] },
      isDeleted: false,
      replayAudio: null,
      replayAudioId: null,
      'serverRecording.segments.attemptId': { $exists: true, $ne: null },
      ...(replayRepairCursor ? { _id: { $gt: replayRepairCursor } } : {}),
    };
    const candidates = await Broadcast.find(query)
      .select('_id').sort({ _id: 1 }).limit(REPLAY_REPAIR_BATCH);
    for (const broadcast of candidates) {
      const job = await BroadcastProcessingJob.findOne({
        broadcastId: broadcast._id, jobType: 'audio_finalization',
      }).select('_id status attempts maxAttempts completedAt updatedAt');
      if (!job) {
        await enqueueBroadcastProcessing(broadcast._id, { transcriptionEnabled: false });
        requeued += 1;
      } else if (eligibleFailedReplayJob(job)) {
        // Compare-and-set prevents repeated sweeps from resetting an already
        // active finalization. Bounded retries preserve incomplete recovery
        // evidence rather than publishing damaged or shortened recordings.
        const update = await BroadcastProcessingJob.updateOne(
          { _id: job._id, status: 'failed' },
          { $set: { status: 'queued', availableAt: new Date(), completedAt: null,
            error: 'Retrying sealed recording reconstruction after backoff' } },
        );
        if (update.modifiedCount) {
          await Broadcast.updateOne({ _id: broadcast._id }, {
            $set: { 'assetStatus.audio': 'processing', processingCompletedAt: null },
          });
          requeued += 1;
        }
      }
    }
    replayRepairCursor = candidates.length === REPLAY_REPAIR_BATCH
      ? candidates[candidates.length - 1]._id : null;
    return requeued;
  } finally {
    replayRepairRunning = false;
  }
}


// Manual recovery never restarts live audio. It only resumes an existing,
// idempotent post-broadcast finalization job using durable server files and
// already-accepted recovery chunks. Compare-and-set leaves active jobs alone.
export async function retryRecordingFinalization(broadcastId, { repairMissing = false } = {}) {
  const existing = await BroadcastProcessingJob.findOne({
    broadcastId, jobType: 'audio_finalization',
  }).select('_id status attempts maxAttempts');
  if (!existing) {
    await enqueueBroadcastProcessing(broadcastId, { transcriptionEnabled: false });
    return { status: 'queued' };
  }
  if (existing.status === 'completed' && !repairMissing) return { status: 'completed' };
  if (existing.status === 'queued' || existing.status === 'processing') {
    return { status: existing.status };
  }
  const updated = await BroadcastProcessingJob.updateOne(
    { _id: existing._id, status: repairMissing ? { $in: ['failed', 'completed'] } : 'failed' },
    { $set: {
      status: 'queued', availableAt: new Date(), completedAt: null,
      startedAt: null, error: null, attempts: 0,
    } }
  );
  if (updated.modifiedCount) {
    await Broadcast.updateOne({ _id: broadcastId }, {
      $set: { 'assetStatus.audio': 'processing', processingCompletedAt: null },
    });
    void processNextJob();
  }
  return { status: 'queued' };
}

export function startBroadcastProcessingWorker(io) {
  socketServer = io;
  if (workerTimer) return;
  BroadcastProcessingJob.updateMany(
    { status: 'processing' },
    {
      $set: {
        status: 'queued',
        availableAt: new Date(),
        startedAt: null,
        error: 'Recovered after backend restart',
      },
    }
  ).catch(() => null);
  BroadcastAudioChunk.updateMany(
    { status: 'processing' },
    { $set: { status: 'pending', error: 'Recovered after backend restart' } }
  ).catch(() => null);
  BroadcastProcessingJob.syncIndexes().catch(() => null);
  BroadcastAudioChunk.syncIndexes().catch(() => null);
  const recover = () => void requeueMissingRecordingFinalizations().catch(error => {
    console.warn('[Echoo Replay] finalization recovery scan warning:', error?.message || error);
  });
  recover();
  replayRepairTimer = setInterval(recover, REPLAY_REPAIR_INTERVAL_MS);
  replayRepairTimer.unref?.();
  workerTimer = setInterval(() => void processNextJob(), POLL_MS);
  workerTimer.unref?.();
  void processNextJob();
}

export function stopBroadcastProcessingWorker() {
  if (workerTimer) clearInterval(workerTimer);
  if (replayRepairTimer) clearInterval(replayRepairTimer);
  workerTimer = null;
  replayRepairTimer = null;
  socketServer = null;
}

export async function getBroadcastProcessing(broadcastId) {
  const [broadcast, jobs] = await Promise.all([
    Broadcast.findById(broadcastId).populate('replayAudio'),
    BroadcastProcessingJob.find({ broadcastId }).sort({ createdAt: 1 }),
  ]);
  return { broadcast, jobs };
}
