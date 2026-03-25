import mongoose, { Schema, Document } from 'mongoose';

export interface ILastRead extends Document {
  user: mongoose.Types.ObjectId;
  room?: mongoose.Types.ObjectId;
  personalChat?: mongoose.Types.ObjectId;
  lastReadAt: Date;
}

const LastReadSchema: Schema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  room: {
    type: Schema.Types.ObjectId,
    ref: 'Room',
    required: false,
    index: true
  },
  personalChat: {
    type: Schema.Types.ObjectId,
    ref: 'PersonalChat',
    required: false,
    index: true
  },
  lastReadAt: {
    type: Date,
    default: Date.now,
    required: true
  }
}, { timestamps: true });

// Ensure unique entry per user per chat
LastReadSchema.index({ user: 1, room: 1 }, { unique: true, partialFilterExpression: { room: { $exists: true } } });
LastReadSchema.index({ user: 1, personalChat: 1 }, { unique: true, partialFilterExpression: { personalChat: { $exists: true } } });

export default mongoose.model<ILastRead>('LastRead', LastReadSchema);
