import mongoose, { Schema, Document } from 'mongoose';

export type RoomType = 'public' | 'private';

export interface IRoom extends Document {
  name: string;
  description?: string;
  visibility: RoomType;
  owner: mongoose.Types.ObjectId;
  admins: mongoose.Types.ObjectId[];
  members: mongoose.Types.ObjectId[];
  bannedUsers: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  admins: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  bannedUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }]
}, { timestamps: true });

// Unique room names
RoomSchema.index({ name: 1 }, { unique: true });

export default mongoose.model<IRoom>('Room', RoomSchema);
