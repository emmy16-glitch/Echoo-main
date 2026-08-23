import mongoose from 'mongoose';

const broadcastAudioChunkSchema = new mongoose.Schema(
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
    chunkId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    startMs: { type: Number, required: true, min: 0 },
    endMs: { type: Number, required: true, min: 0 },
    filePath: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true, maxlength: 120 },
    sizeBytes: { type: Number, required: true, min: 1 },
    sampleRate: { type: Number, required: true, min: 8000, max: 192000 },
    channels: { type: Number, required: true, min: 1, max: 2 },
    bitDepth: { type: Number, required: true, enum: [16, 24, 32] },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, min: 0, default: 0 },
    maxAttempts: { type: Number, min: 1, default: 8 },
    error: { type: String, trim: true, maxlength: 2000, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

broadcastAudioChunkSchema.index({ broadcastId: 1, chunkId: 1 }, { unique: true });
broadcastAudioChunkSchema.index({ broadcastId: 1, chunkIndex: 1 }, { unique: true });
broadcastAudioChunkSchema.index({ broadcastId: 1, status: 1, chunkIndex: 1 });

export default mongoose.model(
  'BroadcastAudioChunk',
  broadcastAudioChunkSchema,
  'echoo_broadcast_audio_chunks'
);
