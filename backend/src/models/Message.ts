import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  room: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content: string;
  type: 'text' | 'image' | 'file';
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema({
  room: {
    type: Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  }
}, { timestamps: true });

export default mongoose.model<IMessage>('Message', MessageSchema);
