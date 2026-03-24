import mongoose, { Schema, Document } from 'mongoose';

export interface IFile extends Document {
  room: mongoose.Types.ObjectId;
  uploader: mongoose.Types.ObjectId;
  filename: string;
  originalName: string;
  path: string;
  mimetype: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema: Schema = new Schema({
  room: {
    type: Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  uploader: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  }
}, { timestamps: true });

export default mongoose.model<IFile>('File', FileSchema);
