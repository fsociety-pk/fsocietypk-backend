import mongoose, { Schema, Document } from 'mongoose';

export interface IWriteupDocument extends Document {
  userId: mongoose.Types.ObjectId;
  challengeId: mongoose.Types.ObjectId;
  title: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const writeupSchema = new Schema<IWriteupDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    challengeId: {
      type: Schema.Types.ObjectId,
      ref: 'Challenge',
      required: [true, 'Challenge ID is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Writeup title is required'],
      trim: true,
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      required: [true, 'Writeup content is required'],
      minlength: [50, 'Content must be at least 50 characters'],
      maxlength: [10000, 'Content cannot exceed 10000 characters'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    adminNotes: {
      type: String,
      default: '',
      maxlength: [500, 'Admin notes cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Ensure only one pending writeup per user per challenge
writeupSchema.index({ userId: 1, challengeId: 1, status: 1 }, { unique: true });

export const Writeup = mongoose.model<IWriteupDocument>('Writeup', writeupSchema);
