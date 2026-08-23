import Broadcast from '../models/Broadcast.js';
import BroadcastProcessingJob from '../models/BroadcastProcessingJob.js';
import BroadcastAudioChunk from '../models/BroadcastAudioChunk.js';
import Notification from '../models/Notification.js';
import TranscriptSegment from '../models/TranscriptSegment.js';
import { flushBroadcastTranscription } from './transcriptionGateway.js';
import {
  markTranscriptQualityChunkFailed,
  processTranscriptQualityChunk,
} from './transcriptQualityService.js';

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

  // Preserve a deterministic dependency order. Jobs can still retry
  // independently, but transcript_completion is always created before the
  // quality/review gate and both precede highlights/chapters.
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

const completeAudio = async (broadcast) => {
  if (!broadcast.replayAudio) throw retryable('Waiting for the final audience-mix recording upload');
  broadcast.assetStatus.audio = 'ready';
  await broadcast.save();
};

const completeTranscript = async (broadcast) => {
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
  if (qualityPending) throw retryable(`Waiting for ${qualityPending} transcript quality chunk job(s)`);

  // Once the browser has successfully opened durable quality chunking, review
  // must not race ahead merely because the first chunk has not arrived yet.
  // This also catches a lost final chunk/complete acknowledgement after End Live.
  if (broadcast.qualityChunkingStartedAt && !broadcast.qualityChunkingCompletedAt) {
    throw retryable('Waiting for the browser to close live quality chunking');
  }
  if (qualityFailed) throw new Error(`${qualityFailed} transcript quality chunk job(s) failed`);
  if (Number(broadcast.qualityChunkUploadErrors) > 0) {
    throw new Error(`${broadcast.qualityChunkUploadErrors} live quality chunk upload(s) were not recovered`);
  }

  // Durable lossless recording chunks are the authoritative quality path when
  // available. Browsers that could not start that path keep the inline Whisper
  // quality fallback. In both cases, the remaining live draft tail is flushed
  // here in the background worker rather than in the creator's End Live request.
  const summary = await flushBroadcastTranscription(broadcast._id);
  if (!summary.finalCount) throw retryable('Waiting for confirmed transcript segments');

  // Do not expose ready_for_review yet. The transcript_improvement job is the
  // explicit quality/review gate so creator notification cannot race ahead of
  // second-pass verification.
  await Broadcast.updateOne(
    { _id: broadcast._id, 'assetStatus.transcript': { $ne: 'published' } },
    { $set: { transcriptState: 'completed' } }
  );
};

const processQualityChunk = async (job) => {
  if (!job.chunkId) throw new Error('Transcript quality job is missing chunkId');
  await BroadcastAudioChunk.updateOne(
    { _id: job.chunkId },
    { $set: { status: 'processing', error: null }, $inc: { attempts: 1 } }
  );
  try {
    return await processTranscriptQualityChunk(job.chunkId);
  } catch (error) {
    await BroadcastAudioChunk.updateOne(
      { _id: job.chunkId },
      { $set: { status: error?.retryable ? 'pending' : 'failed', error: String(error?.message || error).slice(0, 2000) } }
    ).catch(() => null);
    throw error;
  }
};

const improveTranscript = async (broadcast) => {
  if (broadcast.assetStatus?.transcript === 'published') return;

  const completionJob = await BroadcastProcessingJob.findOne({
    broadcastId: broadcast._id,
    jobType: 'transcript_completion',
  }).select('status');

  if (completionJob?.status !== 'completed') {
    throw retryable('Waiting for background transcript quality verification');
  }

  const finalCount = await TranscriptSegment.countDocuments({
    broadcastId: broadcast._id,
    isFinal: true,
    isHidden: false,
  });
  if (!finalCount) throw retryable('Waiting for verified transcript segments');

  // Preserve the earliest generated wording for creator audit/review. The
  // quality pass updates the same provider segment before this gate completes.
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

  // Atomic state transition makes this notification idempotent across worker
  // restarts/retries. If another run already moved the transcript forward,
  // there is nothing left to notify.
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

const detectHighlights = async (broadcast) => {
  if (!['ready_for_review', 'editing', 'published'].includes(broadcast.assetStatus.transcript)) {
    throw retryable('Waiting for transcript review draft');
  }
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
  if (!['ready_for_review', 'editing', 'published'].includes(broadcast.assetStatus.transcript)) {
    throw retryable('Waiting for transcript review draft');
  }
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
  if (!remaining) await Broadcast.updateOne({ _id: broadcastId }, { $set: { processingCompletedAt: new Date() } });
};

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
      const canRetry = error?.retryable && job.attempts < job.maxAttempts;
      job.status = canRetry ? 'queued' : 'failed';
      job.availableAt = new Date(Date.now() + RETRY_MS);
      job.error = String(error?.message || error).slice(0, 2000);
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
      }
    }
  } finally {
    if (job) await emitProcessing(job.broadcastId).catch(() => null);
    workerBusy = false;
  }
}

export function startBroadcastProcessingWorker(io) {
  socketServer = io;
  if (workerTimer) return;
  BroadcastProcessingJob.updateMany(
    { status: 'processing' },
    { $set: { status: 'queued', availableAt: new Date(), error: 'Recovered after backend restart' } }
  ).catch(() => null);
  BroadcastAudioChunk.updateMany(
    { status: 'processing' },
    { $set: { status: 'pending', error: 'Recovered after backend restart' } }
  ).catch(() => null);
  BroadcastProcessingJob.syncIndexes().catch(() => null);
  BroadcastAudioChunk.syncIndexes().catch(() => null);
  workerTimer = setInterval(() => void processNextJob(), POLL_MS);
  workerTimer.unref?.();
  void processNextJob();
}

export function stopBroadcastProcessingWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  socketServer = null;
}

export async function getBroadcastProcessing(broadcastId) {
  const [broadcast, jobs] = await Promise.all([
    Broadcast.findById(broadcastId).populate('replayAudio'),
    BroadcastProcessingJob.find({ broadcastId }).sort({ createdAt: 1 }),
  ]);
  return { broadcast, jobs };
}
