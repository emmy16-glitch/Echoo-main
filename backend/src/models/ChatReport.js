import mongoose from 'mongoose';

const chatReportSchema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', required: true },
  broadcastId: { type: mongoose.Schema.Types.ObjectId, ref: 'Broadcast', required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true, enum: ['Spam or misleading content', 'Harassment or hate', 'Inappropriate content', 'Something else'] },
  status: { type: String, enum: ['pending', 'reviewed'], default: 'pending' },
}, { timestamps: true, versionKey: false });

chatReportSchema.index({ messageId: 1, reporterId: 1 }, { unique: true });
chatReportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('ChatReport', chatReportSchema, 'echoo_chat_reports');
