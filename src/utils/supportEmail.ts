import { randomUUID } from 'crypto';
import { SupportTicket } from '../models/SupportTicket';
import { User } from '../models/User';
import { env } from '../config/env';
import { sendPlatformEmail } from './emailHelper';
import logger from './logger';

/** The ticket itself is the durable outbox, so email failures never lose a request. */
export async function processSupportEmails() {
  const to = env.SUPPORT_NOTIFICATION_EMAIL || env.CHALLENGE_NOTIFICATION_EMAIL || env.ADMIN_EMAIL;
  if (!to) return;
  await SupportTicket.updateMany({ emailStatus: 'sending', emailNextAttemptAt: { $lte: new Date() }, emailAttempts: { $gte: 5 } }, { $set: { emailStatus: 'failed' } });
  for (let i = 0; i < 10; i++) {
    const lease = randomUUID();
    const ticket = await SupportTicket.findOneAndUpdate({ emailStatus: { $in: ['queued', 'sending'] }, emailNextAttemptAt: { $lte: new Date() }, emailAttempts: { $lt: 5 } }, { $set: { emailStatus: 'sending', emailLease: lease, emailNextAttemptAt: new Date(Date.now() + 120000) }, $inc: { emailAttempts: 1 } }, { new: true }).select('+emailAttempts');
    if (!ticket) break;
    try {
      const user = await User.findById(ticket.userId).select('username +email');
      const origin = env.CORS_ORIGIN.split(',')[0].trim().replace(/\/$/, '');
      await sendPlatformEmail(to, `Support ticket: ${ticket.subject.replace(/[\r\n]/g, ' ')}`, `A member has contacted you.\n\nTicket: ${ticket._id}\nFrom: ${user?.username || 'Member'} (${user?.email || 'Account removed'})\nCategory: ${ticket.category}\nSubject: ${ticket.subject}\n\n${ticket.messages[0]?.body}\n\nReply in your admin inbox: ${origin}/admin/support?ticket=${ticket._id}`);
      await SupportTicket.updateOne({ _id: ticket._id, emailLease: lease }, { $set: { emailStatus: 'sent' }, $unset: { emailLease: 1 } });
    } catch {
      await SupportTicket.updateOne({ _id: ticket._id, emailLease: lease }, { $set: { emailStatus: ticket.emailAttempts >= 5 ? 'failed' : 'queued', emailNextAttemptAt: new Date(Date.now() + 30000 * 2 ** (ticket.emailAttempts - 1)) }, $unset: { emailLease: 1 } });
      logger.warn('Support ticket email delivery failed; ticket remains available in the admin inbox.');
    }
  }
}
