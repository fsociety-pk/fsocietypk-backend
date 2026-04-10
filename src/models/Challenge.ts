import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IChallenge } from '../types';

export interface IChallengeDocument
  extends Omit<IChallenge, '_id' | 'createdAt' | 'updatedAt' | 'author' | 'createdBy'>,
    Document {
  createdBy: mongoose.Types.ObjectId;
  rejectionReason?: string | null;
  compareFlag(candidateFlag: string): Promise<boolean>;
}

// Points map by difficulty
const DIFFICULTY_POINTS: Record<string, number> = {
  easy: 50,
  medium: 100,
  hard: 200,
  insane: 250,
};

const challengeSchema = new Schema<IChallengeDocument>(
  {
    title: {
      type: String,
      required: [true, 'Challenge title is required'],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    category: {
      type: String,
      enum: ['web', 'pwn', 'rev', 'crypto', 'forensics', 'osint', 'misc', 'stego', 'network', 'mobile'],
      required: [true, 'Category is required'],
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'insane'],
      required: [true, 'Difficulty is required'],
    },
    points: {
      type: Number,
      min: [1, 'Points must be at least 1'],
    },
    flag: {
      type: String,
      required: [true, 'Flag is required'],
      select: false, // Never return flag in queries
    },
    hints: [
      {
        content: String,
        cost: { type: Number, default: 0 },
      },
    ],
    // Legacy "files" field kept for backwards compat
    files: [
      {
        filename: String,
        url: String,
        size: Number,
      },
    ],
    // New "attachments" field (URLs or file names)
    attachments: [
      {
        type: String,
        trim: true,
      },
    ],
    solveCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    // "createdBy" is the submitting user
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Keep backwards-compat "author" virtual
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: expose "author" as alias for "createdBy" for legacy code
challengeSchema.virtual('author', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true,
});

// Pre-save: auto-generate slug from title
challengeSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

// Pre-save: auto-assign points based on difficulty
challengeSchema.pre('save', function (next) {
  if (this.isModified('difficulty') || !this.points) {
    this.points = DIFFICULTY_POINTS[this.difficulty] ?? 50;
  }
  next();
});

// Pre-save: hash flag with bcrypt if modified
challengeSchema.pre('save', async function (next) {
  if (!this.isModified('flag')) return next();
  // Only hash if it looks like a plain-text flag (not already a bcrypt hash)
  if (!this.flag.startsWith('$2')) {
    const salt = await bcrypt.genSalt(12);
    this.flag = await bcrypt.hash(this.flag.trim().toLowerCase(), salt);
  }
  next();
});

// Instance method: compare submitted flag against stored hash
challengeSchema.methods.compareFlag = async function (candidateFlag: string): Promise<boolean> {
  return bcrypt.compare(candidateFlag.trim().toLowerCase(), this.flag);
};

export const Challenge = mongoose.model<IChallengeDocument>('Challenge', challengeSchema);
