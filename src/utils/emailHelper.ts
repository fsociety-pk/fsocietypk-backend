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

const getSafeMailError = (error: unknown): { code?: string; responseCode?: number; message: string } => {
  const mailError = error as { code?: unknown; responseCode?: unknown; message?: unknown } | null;
  return {
    ...(typeof mailError?.code === 'string' && { code: mailError.code }),
    ...(typeof mailError?.responseCode === 'number' && { responseCode: mailError.responseCode }),
    message: (typeof mailError?.message === 'string' ? mailError.message : 'Unknown email transport error').slice(0, 300),
  };
};

/** Check SMTP connectivity and authentication without sending a message. */
export const verifyChallengeEmailTransport = async (): Promise<void> => {
  if (!transporter) {
    logger.warn('SMTP status: NOT CONFIGURED — challenge email notifications are disabled.');
    return;
  }

  logger.info(`SMTP status: checking ${env.SMTP_HOST}:${env.SMTP_PORT}...`);

  try {
    await transporter.verify();
    logger.info('SMTP status: READY — server connection and authentication succeeded.');
  } catch (error) {
    logger.error('SMTP status: FAILED — challenge emails will not send until this is fixed.', getSafeMailError(error));
  }
};

export const sendChallengeSubmissionEmail = async ({
  challengeTitle,
  submitterUsername,
}: {
  challengeTitle: string;
  submitterUsername: string;
}): Promise<void> => {
  if (!transporter || !env.CHALLENGE_NOTIFICATION_EMAIL || !env.SMTP_USER) {
    logger.debug('Skipped challenge email because SMTP settings are incomplete.');
    return;
  }

  try {
    const result = await transporter.sendMail({
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
    logger.info('Challenge submission email sent successfully.', { messageId: result.messageId });
  } catch (error) {
    // Email is a secondary alert; a provider issue must not fail the challenge submission.
    logger.error('Could not send challenge submission email.', getSafeMailError(error));
  }
};
