import mongoose from 'mongoose';

const broadcastProcessingJobSchema = new mongoose.Schema(
  {
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Broadcast',
      required: true,
      index: true,
    },
    jobType: {
      type: String,
      enum: [
        'audio_finalization',
        'transcript_completion',
        'transcript_improvement',
        'transcript_quality_chunk',
        'highlight_detection',
        'chapter_generation',
      ],
      required: true,
      index: true,
    },
    chunkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BroadcastAudioChunk',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    attempts: { type: Number, min: 0, default: 0 },
    maxAttempts: { type: Number, min: 1, default: 60 },
    availableAt: { type: Date, default: Date.now, index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error: { type: String, trim: true, maxlength: 2000, default: null },
  },
  { timestamps: true, versionKey: false }
);

broadcastProcessingJobSchema.index({ broadcastId: 1, jobType: 1, chunkId: 1 }, { unique: true });
broadcastProcessingJobSchema.index({ status: 1, availableAt: 1, createdAt: 1 });

export default mongoose.model(
  'BroadcastProcessingJob',
  broadcastProcessingJobSchema,
  'echoo_broadcast_processing_jobs'
);
