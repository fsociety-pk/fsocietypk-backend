import mongoose, { Schema, Document } from 'mongoose';

export interface IResource extends Document {
  title: string;
  description: string;
  githubLink: string;
  category: string;
  createdBy: mongoose.Types.ObjectId;
  isApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const resourceSchema = new Schema<IResource>(
  {
    title: {
      type: String,
      required: [true, 'Resource title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Resource description is required'],
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    githubLink: {
      type: String,
      required: [true, 'GitHub repository link is required'],
      trim: true,
      validate: {
        validator: function (v: string) {
          return /^https:\/\/github\.com\//.test(v);
        },
        message: 'Please provide a valid GitHub repository link',
      },
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: ['web', 'crypto', 'forensics', 'reverse-engineering', 'pwn', 'osint', 'general', 'tools'],
      lowercase: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Resource = mongoose.model<IResource>('Resource', resourceSchema);
