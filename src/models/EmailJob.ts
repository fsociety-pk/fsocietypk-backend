import { Schema, model } from 'mongoose';
const emailJobSchema = new Schema({
  _id: { type: String, required: true },
  eventKey: { type: String, required: true },
  recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  audience: { type: String, required: true },
  subject: { type: String, required: true },
  text: { type: String, required: true },
  status: { type: String, enum: ['queued', 'sending', 'retry', 'sent', 'failed', 'skipped'], default: 'queued', required: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  sentAt: Date,
  lastError: { type: String, maxlength: 160 },
  leaseToken: String,
}, { timestamps: true });
emailJobSchema.index({ eventKey: 1, recipientId: 1 }, { unique: true });
emailJobSchema.index({ status: 1, nextAttemptAt: 1 });
export const EmailJob = model('EmailJob', emailJobSchema);
