import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Broadcast',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    type: {
      type: String,
      enum: ['message', 'reaction', 'announcement', 'system'],
      default: 'message',
    },
    reactions: [{
      emoji: String,
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    }],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
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

// Indexes
chatMessageSchema.index({ broadcastId: 1, createdAt: -1 });
chatMessageSchema.index({ userId: 1, createdAt: -1 });
chatMessageSchema.index({ isPinned: 1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema, 'echoo_chat_messages');
export default ChatMessage;
