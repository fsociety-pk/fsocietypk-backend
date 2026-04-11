import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IChallenge } from '../types';

export interface IChallengeDocument
  extends Omit<IChallenge, '_id' | 'createdAt' | 'updatedAt' | 'author' | 'createdBy'>,
    Document {
  createdBy: mongoose.Types.ObjectId;
  rejectionReason?: string | null;
  compareFlag(candidateFlag: string, sequenceNumber?: number): Promise<boolean>;
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
      required: false, // Deprecated: kept for backwards compatibility
      select: false,
    },
    flags: [
      {
        sequence: {
          type: Number,
          required: true,
        },
        value: {
          type: String,
          required: true,
        },
      },
    ],
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

// Pre-save: hash flags with bcrypt if modified
challengeSchema.pre('save', async function (next) {
  // Handle legacy flag field
  if (this.isModified('flag') && this.flag) {
    if (!this.flag.startsWith('$2')) {
      const salt = await bcrypt.genSalt(12);
      this.flag = await bcrypt.hash(this.flag.trim().toLowerCase(), salt);
    }
  }
  
  // Handle new flags array
  if (this.isModified('flags') && this.flags && this.flags.length > 0) {
    await Promise.all(
      this.flags.map(async (flag) => {
        if (!flag.value.startsWith('$2')) {
          const salt = await bcrypt.genSalt(12);
          flag.value = await bcrypt.hash(flag.value.trim().toLowerCase(), salt);
        }
      })
    );
  }
  next();
});

// Instance method: compare submitted flag against stored hash(es)
// For multiple flags, checks both the legacy single flag and the new flags array
challengeSchema.methods.compareFlag = async function (candidateFlag: string, sequenceNumber?: number): Promise<boolean> {
  const normalized = candidateFlag.trim().toLowerCase();
  
  // If sequence number provided, check specific flag in array
  if (sequenceNumber !== undefined && this.flags && this.flags.length > 0) {
    const flagEntry = this.flags.find((f: any) => f.sequence === sequenceNumber);
    if (flagEntry) {
      return bcrypt.compare(normalized, flagEntry.value);
    }
    return false;
  }
  
  // For multi-flag challenges, require sequenceNumber to avoid accepting flags out of order.
  if (this.flags && this.flags.length > 0) {
    return false;
  }
  
  // Fallback to legacy single flag field
  if (this.flag) {
    return bcrypt.compare(normalized, this.flag);
  }
  
  return false;
};

export const Challenge = mongoose.model<IChallengeDocument>('Challenge', challengeSchema);
