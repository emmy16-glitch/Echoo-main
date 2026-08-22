import mongoose from 'mongoose';

const transcriptSessionErrorSchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, maxlength: 80, default: 'TRANSCRIPTION_ERROR' },
    message: { type: String, trim: true, maxlength: 1000, required: true },
    retryable: { type: Boolean, default: false },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const transcriptSessionSchema = new mongoose.Schema(
  {
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Broadcast',
      required: true,
      index: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    state: {
      type: String,
      enum: [
        'starting',
        'connecting',
        'connected',
        'reconnecting',
        'flushing',
        'completed',
        'failed',
        'abandoned',
      ],
      default: 'starting',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'failed'],
      default: 'active',
      index: true,
    },
    provider: { type: String, trim: true, maxlength: 80, default: 'whisper-flow' },
    model: { type: String, trim: true, maxlength: 80, default: 'faster-whisper-large-v3-turbo' },
    startedAt: { type: Date, default: Date.now },
    offsetMs: { type: Number, min: 0, default: 0 },
    captureOffset: { type: Number, min: 0, default: 0 },
    lastReceivedFrame: { type: Number, min: -1, default: -1 },
    lastSentFrame: { type: Number, min: -1, default: -1 },
    lastAcknowledgedFrame: { type: Number, min: -1, default: -1 },
    lastProviderSequence: { type: Number, min: 0, default: 0 },
    retryCount: { type: Number, min: 0, default: 0 },
    bufferedFramesDropped: { type: Number, min: 0, default: 0 },
    language: { type: String, trim: true, maxlength: 16, default: 'en' },
    failureReason: { type: String, trim: true, maxlength: 1000, default: null },
    lastTranscriptLatencyMs: { type: Number, min: 0, default: null },
    lastProcessingMs: { type: Number, min: 0, default: null },
    errorLog: { type: [transcriptSessionErrorSchema], default: [] },
    connectedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.creatorId;
        ret.errors = ret.errorLog || [];
        delete ret.errorLog;
        return ret;
      },
    },
  }
);

transcriptSessionSchema.index({ broadcastId: 1, createdAt: -1 });
transcriptSessionSchema.index({ creatorId: 1, state: 1, lastActivityAt: -1 });
transcriptSessionSchema.index({ broadcastId: 1, status: 1, startedAt: -1 });

const TranscriptSession = mongoose.model(
  'TranscriptSession',
  transcriptSessionSchema,
  'echoo_transcript_sessions'
);

export default TranscriptSession;
