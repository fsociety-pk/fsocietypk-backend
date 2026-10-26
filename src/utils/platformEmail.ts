import { createHash, randomUUID } from 'crypto';
import { User } from '../models/User';
import { EmailJob } from '../models/EmailJob';
import { emailIsConfigured, sendPlatformEmail } from './emailHelper';
import { env } from '../config/env';
import logger from './logger';
import { isStaff, type Role } from './roles';
type Audience = Role | 'all' | 'staff';
let processing = false;
let stopping = false;

export const audienceFilter = (audience: Audience) => ({ isBanned: false, ...(audience === 'all' ? {} : { role: audience === 'staff' ? { $ne: 'user' } : audience }), email: { $type: 'string', $ne: '' } });
/** Persistent, deduplicated recipients. Workers deliver outside the publishing request. */
export const enqueuePlatformEmail = async (eventKey: string, audience: Audience, subject: string, text: string): Promise<number> => {
  let count = 0;
  const cursor = User.find(audienceFilter(audience)).select('_id').cursor();
  let operations: any[] = [];
  const flush = async () => {
    if (!operations.length) return;
    try { const result = await EmailJob.bulkWrite(operations, { ordered: false }); count += result.upsertedCount; }
    catch (error: any) {
      if (!error.writeErrors?.length || error.writeErrors.some((item: any) => item.code !== 11000) || error.writeConcernErrors?.length) throw error;
      count += error.result?.upsertedCount || 0;
    }
    operations = [];
  };
  for await (const user of cursor) {
    const _id = createHash('sha256').update(`${eventKey}:${user._id}`).digest('hex');
    operations.push({ updateOne: { filter: { _id }, update: { $setOnInsert: { eventKey, recipientId: user._id, audience, subject: subject.replace(/[\r\n]/g, ' '), text, status: 'queued', attempts: 0, nextAttemptAt: new Date() } }, upsert: true } });
    if (operations.length >= 250) await flush();
  }
  await flush();
  return count;
};
export const enqueueChallengeEmail = (id: string, title: string, description: string) => {
  const origin = env.CORS_ORIGIN.split(',')[0].trim().replace(/\/$/, '');
  return enqueuePlatformEmail(`challenge-published:${id}`, 'user', `New Fsociety PK challenge: ${title}`, `A new challenge is ready for you.\n\n${title}\n\n${description.slice(0, 1200)}\n\nOpen the challenge: ${origin}/challenges/${encodeURIComponent(id)}\n\nYou’re receiving this update at your registered Fsociety PK account email.`);
};
export const processEmailQueue = async (): Promise<void> => {
  if (processing || stopping || !emailIsConfigured) return;
  processing = true;
  try {
    await EmailJob.updateMany({ status: 'sending', nextAttemptAt: { $lte: new Date() }, attempts: { $gte: 5 } }, { $set: { status: 'failed', lastError: 'Delivery interrupted after final attempt' } });
    for (let i = 0; i < 20 && !stopping; i++) {
      const leaseToken = randomUUID();
      const job = await EmailJob.findOneAndUpdate({ status: { $in: ['queued', 'retry', 'sending'] }, nextAttemptAt: { $lte: new Date() }, attempts: { $lt: 5 } }, { $set: { status: 'sending', leaseToken, nextAttemptAt: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { new: true, sort: { nextAttemptAt: 1 } });
      if (!job) break;
      try {
        const recipient = await User.findById(job.recipientId).select('+email role isBanned');
        const matches = recipient && !recipient.isBanned && recipient.email && (job.audience === 'all' || job.audience === 'staff' && isStaff(recipient.role) || recipient.role === job.audience);
        if (!matches) { await EmailJob.updateOne({ _id: job._id, leaseToken }, { $set: { status: 'skipped' }, $unset: { leaseToken: 1 } }); continue; }
        await sendPlatformEmail(recipient.email!, job.subject, job.text);
        await EmailJob.updateOne({ _id: job._id, leaseToken }, { $set: { status: 'sent', sentAt: new Date() }, $unset: { leaseToken: 1, lastError: 1 } });
      } catch {
        await EmailJob.updateOne({ _id: job._id, leaseToken }, { $set: { status: job.attempts >= 5 ? 'failed' : 'retry', lastError: 'Email provider could not complete delivery', nextAttemptAt: new Date(Date.now() + Math.min(900000, 30000 * 2 ** (job.attempts - 1))) }, $unset: { leaseToken: 1 } });
        logger.warn('A platform email is awaiting delivery or retry.');
      }
    }
  } catch { logger.error('Platform email queue processing failed. Jobs remain persisted for retry.'); }
  finally { processing = false; }
};
export const startEmailWorker = () => {
  stopping = false;
  let current: Promise<void> | undefined;
  const tick = () => { if (!current) current = processEmailQueue().finally(() => { current = undefined; }); };
  tick();
  const timer = setInterval(tick, 15000);
  timer.unref();
  return async () => { stopping = true; clearInterval(timer); await current; };
};
