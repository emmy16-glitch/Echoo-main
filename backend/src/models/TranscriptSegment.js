import mongoose from 'mongoose';

const transcriptSegmentSchema = new mongoose.Schema(
  {
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Broadcast',
      required: true,
      index: true,
    },
    audioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Audio',
      default: null,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TranscriptSession',
      default: null,
      index: true,
    },
    providerSegmentId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    sequence: {
      type: Number,
      required: true,
      min: 0,
    },
    startMs: {
      type: Number,
      required: true,
      min: 0,
    },
    endMs: {
      type: Number,
      required: true,
      min: 0,
    },
    speaker: {
      type: String,
      trim: true,
      maxlength: 120,
      default: 'Speaker',
    },
    sourceType: {
      type: String,
      enum: ['host_microphone', 'guest_microphone', 'music', 'screen_share', 'system_audio', 'final_mix', 'unknown'],
      default: 'final_mix',
      index: true,
    },
    sourceLabel: {
      type: String,
      trim: true,
      maxlength: 120,
      default: 'Echoo final mix',
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 8000,
    },
    originalText: {
      type: String,
      trim: true,
      maxlength: 8000,
      default: '',
    },
    editedText: {
      type: String,
      trim: true,
      maxlength: 8000,
      default: '',
    },
    qualityHistory: [{
      text: { type: String, trim: true, maxlength: 8000, required: true },
      speaker: { type: String, trim: true, maxlength: 120, default: 'Speaker' },
      startMs: { type: Number, min: 0, required: true },
      endMs: { type: Number, min: 0, required: true },
      confidence: { type: Number, min: 0, max: 1, default: null },
      revision: { type: Number, min: 1, required: true },
      processedBy: { type: String, trim: true, maxlength: 120, required: true },
      processedAt: { type: Date, default: Date.now },
    }],
    editHistory: [{
      text: { type: String, trim: true, maxlength: 8000, required: true },
      speaker: { type: String, trim: true, maxlength: 120, default: 'Speaker' },
      version: { type: Number, min: 1, required: true },
      editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      editedAt: { type: Date, default: Date.now },
    }],
    publicationStatus: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    publishedAt: { type: Date, default: null },
    isFinal: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['partial', 'final'],
      default: 'partial',
      index: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    providerRevision: {
      type: Number,
      min: 0,
      default: 0,
    },
    provider: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'whisper-flow',
    },
    language: {
      type: String,
      trim: true,
      maxlength: 16,
      default: 'en',
    },
    revision: {
      type: Number,
      min: 1,
      default: 1,
    },
    revisionNumber: {
      type: Number,
      min: 1,
    },
    processedBy: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    processedAt: { type: Date, default: null },
    qualityChunkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BroadcastAudioChunk',
      index: true,
    },
    qualitySegmentIndex: {
      type: Number,
      min: 0,
    },
    isHighlighted: { type: Boolean, default: false, index: true },
    isPinned: { type: Boolean, default: false, index: true },
    isHidden: { type: Boolean, default: false, index: true },
    correctedAt: { type: Date, default: null },
    correctedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    moderationUpdatedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        if (ret.sessionId) ret.sessionId = String(ret.sessionId);
        ret.startTime = Number(ret.startMs || 0) / 1000;
        ret.endTime = Number(ret.endMs || 0) / 1000;
        return ret;
      },
    },
  }
);

transcriptSegmentSchema.index(
  { broadcastId: 1, sessionId: 1, providerSegmentId: 1 },
  { unique: true }
);
transcriptSegmentSchema.index({ broadcastId: 1, startMs: 1, _id: 1 });
transcriptSegmentSchema.index({ audioId: 1, startMs: 1, _id: 1 });
transcriptSegmentSchema.index({ broadcastId: 1, sequence: 1, startMs: 1 });
transcriptSegmentSchema.index({ audioId: 1, sequence: 1, startMs: 1 });
transcriptSegmentSchema.index({ audioId: 1, isFinal: 1, startMs: 1, _id: 1 });
transcriptSegmentSchema.index({ broadcastId: 1, qualityChunkId: 1, qualitySegmentIndex: 1 }, { unique: true, sparse: true });
transcriptSegmentSchema.index({ broadcastId: 1, isHighlighted: 1, startMs: 1 });
transcriptSegmentSchema.index({ text: 'text' });
transcriptSegmentSchema.index({ broadcastId: 1, publicationStatus: 1, isFinal: 1, startMs: 1 });

const TranscriptSegment = mongoose.model(
  'TranscriptSegment',
  transcriptSegmentSchema,
  'echoo_transcript_segments'
);

export default TranscriptSegment;
