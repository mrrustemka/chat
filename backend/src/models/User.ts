import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    immutable: true // Username is immutable after registration
  },
  passwordHash: {
    type: String,
    required: true
  }
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
