import mongoose, { Schema, Document } from 'mongoose';

export interface IPersonalChat extends Document {
  participants: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const PersonalChatSchema: Schema = new Schema({
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }]
}, { timestamps: true });

// Ensure exactly 2 participants and uniqueness
PersonalChatSchema.path('participants').validate(function(val) {
  return val.length === 2;
}, 'Personal chat must have exactly 2 participants');

// Index for quick lookup of chat between two users (order independent)
// We'll sort participants before saving to ensure uniqueness with one index
PersonalChatSchema.index({ participants: 1 });

export default mongoose.model<IPersonalChat>('PersonalChat', PersonalChatSchema);
