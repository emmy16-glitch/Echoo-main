import mongoose from 'mongoose';

const uploadSessionSchema = new mongoose.Schema({
  uploadId: { type: String, required: true, unique: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  filename: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true },
  // Bounded SHA-256 sample prevents resuming another same-name/size recording.
  fingerprint: { type: String, default: null },
  offset: { type: Number, default: 0 },
  chunkSize: { type: Number, required: true },
  status: { type: String, enum: ['uploading', 'completed', 'cancelled'], default: 'uploading' },
  audio: { type: mongoose.Schema.Types.ObjectId, ref: 'Audio', default: null },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true, versionKey: false });

export default mongoose.model('UploadSession', uploadSessionSchema, 'echoo_upload_sessions');
