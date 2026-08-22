import mongoose from 'mongoose';

const savedMomentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    audioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Audio', default: null, index: true },
    broadcastId: { type: mongoose.Schema.Types.ObjectId, ref: 'Broadcast', default: null, index: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Station', default: null, index: true },
    transcriptSegmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TranscriptSegment', default: null },
    timestampMs: { type: Number, required: true, min: 0 },
    transcriptSnippet: { type: String, trim: true, maxlength: 1200, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

savedMomentSchema.index({ userId: 1, createdAt: -1, _id: -1 });
savedMomentSchema.index(
  { userId: 1, audioId: 1, broadcastId: 1, timestampMs: 1 },
  { unique: true }
);

const SavedMoment = mongoose.model('SavedMoment', savedMomentSchema, 'echoo_saved_moments');
export default SavedMoment;
