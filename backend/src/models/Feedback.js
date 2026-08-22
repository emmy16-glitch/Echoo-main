import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: [true, 'Feedback message is required'],
      trim: true,
      minlength: [1, 'Feedback message is required'],
      maxlength: [2000, 'Feedback cannot exceed 2000 characters'],
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

feedbackSchema.index({ submittedBy: 1, createdAt: -1 });

const Feedback = mongoose.model('Feedback', feedbackSchema, 'echoo_feedback');
export default Feedback;
