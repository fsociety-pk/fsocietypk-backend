import { Schema, model } from 'mongoose';

const file = new Schema({
  fileKey: { type: String, required: true }, originalName: { type: String, required: true },
  contentType: { type: String, required: true }, size: { type: Number, required: true },
}, { _id: false });
const schema = new Schema({
  title: { type: String, required: true }, eventDate: { type: String, required: true },
  eventYear: { type: Number, required: true }, placement: { type: String, default: '' },
  description: { type: String, default: '' }, eventUrl: { type: String, default: '' },
  isPublished: { type: Boolean, default: false }, file: { type: file, required: true },
}, { timestamps: true });
schema.index({ isPublished: 1, eventYear: -1, eventDate: -1, _id: -1 });
export const TeamCertificate = model('TeamCertificate', schema);
