import mongoose, { Schema, Document } from 'mongoose';

export interface ISubmissionDocument extends Document {
  userId: mongoose.Types.ObjectId;
  challengeId: mongoose.Types.ObjectId;
  submittedFlag?: string;
  sequenceNumber?: number;
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
      trim: true,
      select: false,
    },
    sequenceNumber: {
      type: Number,
      required: false,
      min: 1,
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

// Prevent parallel requests from awarding the same single-flag solve twice.
submissionSchema.index(
  { userId: 1, challengeId: 1 },
  {
    unique: true,
    partialFilterExpression: { isCorrect: true, sequenceNumber: null },
    name: 'unique_single_flag_solve',
  }
);

// Multi-flag challenges can award each sequence exactly once per user.
submissionSchema.index(
  { userId: 1, challengeId: 1, sequenceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { isCorrect: true, sequenceNumber: { $type: 'number' } },
    name: 'unique_multi_flag_step_solve',
  }
);

export const Submission = mongoose.model<ISubmissionDocument>('Submission', submissionSchema);
