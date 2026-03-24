import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  room?: mongoose.Types.ObjectId;
  personalChat?: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  replyTo?: mongoose.Types.ObjectId;
  content: string;
  type: 'text' | 'image' | 'file';
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema({
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
  },
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    required: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

export default mongoose.model<IMessage>('Message', MessageSchema);
