import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  title: string;
  description: string;
  techStack: string[];
  websiteUrl?: string;
  sourceCodeUrl?: string;
  features?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    techStack: [{ type: String }],
    websiteUrl: { type: String },
    sourceCodeUrl: { type: String },
    features: [{ type: String }],
  },
  { timestamps: true }
);

export const Project = mongoose.model<IProject>('Project', projectSchema);
