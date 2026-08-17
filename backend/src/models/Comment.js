import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      maxlength: [2000, 'Comment cannot exceed 2000 characters'],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    audioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Audio',
      required: true,
      index: true,
    },
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    likeCount: {
      type: Number,
      default: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

commentSchema.index({ audioId: 1, createdAt: -1 });
commentSchema.index({ author: 1, createdAt: -1 });

commentSchema.methods.incrementLikes = async function() {
  this.likeCount += 1;
  return await this.save();
};

commentSchema.methods.decrementLikes = async function() {
  if (this.likeCount > 0) {
    this.likeCount -= 1;
    return await this.save();
  }
  return this;
};

const Comment = mongoose.model('Comment', commentSchema, 'echoo_comments');
export default Comment;
