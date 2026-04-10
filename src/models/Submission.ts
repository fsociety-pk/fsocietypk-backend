import mongoose, { Schema, Document } from 'mongoose';

export interface ISubmissionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  challengeId: mongoose.Types.ObjectId;
  submittedFlag: string;
  isCorrect: boolean;
  pointsAwarded: number;
  timestamp: Date;
}

const submissionSchema = new Schema<ISubmissionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    challengeId: {
      type: Schema.Types.ObjectId,
      ref: 'Challenge',
      required: [true, 'Challenge ID is required'],
    },
    submittedFlag: {
      type: String,
      required: [true, 'Submitted flag is required'],
      trim: true,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    pointsAwarded: {
      type: Number,
      default: 0,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // using explicit "timestamp" field
  }
);

// Compound index: quickly find a user's solve for a specific challenge
submissionSchema.index({ userId: 1, challengeId: 1 });

export const Submission = mongoose.model<ISubmissionDocument>('Submission', submissionSchema);
