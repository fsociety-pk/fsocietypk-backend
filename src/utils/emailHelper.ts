import nodemailer from 'nodemailer';
import { env } from '../config/env';
import logger from './logger';

const emailIsConfigured = Boolean(
  env.SMTP_HOST &&
  env.SMTP_USER &&
  env.SMTP_PASSWORD &&
  env.CHALLENGE_NOTIFICATION_EMAIL
);

const transporter = emailIsConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    })
  : null;

export const sendChallengeSubmissionEmail = async ({
  challengeTitle,
  submitterUsername,
}: {
  challengeTitle: string;
  submitterUsername: string;
}): Promise<void> => {
  if (!transporter || !env.CHALLENGE_NOTIFICATION_EMAIL || !env.SMTP_USER) {
    logger.info('Challenge email notifications are disabled; SMTP settings are incomplete.');
    return;
  }

  try {
    await transporter.sendMail({
      from: `FsocietyPK Notifications <${env.SMTP_USER}>`,
      to: env.CHALLENGE_NOTIFICATION_EMAIL,
      subject: 'New challenge submission awaiting review',
      text: [
        'A new challenge has been submitted and is waiting for review.',
        '',
        `Challenge: ${challengeTitle}`,
        `Submitted by: ${submitterUsername}`,
        '',
        'Open the admin dashboard to review it.',
      ].join('\n'),
    });
  } catch (error) {
    // Email is a secondary alert; a provider issue must not fail the challenge submission.
    logger.error('Could not send challenge submission email:', error);
  }
};
