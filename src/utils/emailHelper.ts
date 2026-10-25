import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { User } from '../models/User';
import logger from './logger';

const emailIsConfigured = Boolean(
  env.SMTP_HOST &&
  env.SMTP_USER &&
  env.SMTP_PASSWORD
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
    logger.warn('SMTP status: NOT CONFIGURED — email notifications are disabled.');
    return;
  }

  logger.info(`SMTP status: checking ${env.SMTP_HOST}:${env.SMTP_PORT}...`);

  try {
    await transporter.verify();
    logger.info('SMTP status: READY — server connection and authentication succeeded.');
  } catch (error) {
    logger.error('SMTP status: FAILED — emails will not send until this is fixed.', getSafeMailError(error));
  }
};

export const sendSubmissionEmail = async ({
  contentType,
  title,
  submitterUsername,
  submitterId,
}: {
  contentType: 'challenge' | 'writeup' | 'resource' | 'project';
  title: string;
  submitterUsername?: string;
  submitterId?: string;
}): Promise<void> => {
  if (!transporter || !env.CHALLENGE_NOTIFICATION_EMAIL || !env.SMTP_USER) {
    logger.debug(`Skipped ${contentType} email because SMTP settings are incomplete.`);
    return;
  }

  try {
    const submitter = !submitterUsername && submitterId
      ? await User.findById(submitterId).select('username')
      : null;
    const username = submitterUsername || submitter?.username || 'A user';
    const label = contentType.charAt(0).toUpperCase() + contentType.slice(1);
    const isPublished = contentType === 'project';
    const result = await transporter.sendMail({
      from: `FsocietyPK Notifications <${env.SMTP_USER}>`,
      to: env.CHALLENGE_NOTIFICATION_EMAIL,
      subject: isPublished ? 'New project published' : `New ${contentType} submission awaiting review`,
      text: [
        isPublished
          ? 'A new project has been published.'
          : `A new ${contentType} has been submitted and is waiting for review.`,
        '',
        `${label}: ${title}`,
        `Submitted by: ${username}`,
        '',
        `Open the admin dashboard to ${isPublished ? 'view' : 'review'} it.`,
      ].join('\n'),
    });
    logger.info(`${label} submission email sent successfully.`, { messageId: result.messageId });
  } catch (error) {
    // Email is a secondary alert; lookup or provider issues must not fail the submission.
    logger.error(`Could not send ${contentType} submission email.`, getSafeMailError(error));
  }
};

export const sendChallengeSubmissionEmail = async ({
  challengeTitle,
  submitterUsername,
}: {
  challengeTitle: string;
  submitterUsername: string;
}): Promise<void> => sendSubmissionEmail({
  contentType: 'challenge',
  title: challengeTitle,
  submitterUsername,
});

/** Account verification is required: transport failure must fail registration. */
export const sendVerificationEmail = async (email: string, code: string): Promise<void> => {
  if (!transporter || !env.SMTP_USER) throw new Error('Email verification is temporarily unavailable. Please try again later.');
  try {
    await transporter.sendMail({
      from: `Fsociety PK <${env.SMTP_USER}>`,
      to: email,
      subject: `${code} is your Fsociety PK verification code`,
      text: `Welcome to Fsociety PK.\n\nYour verification code is: ${code}\n\nIt expires in 10 minutes. Never share this code. If you did not request an account, ignore this email.\n\nLearn. Practice. Share.`,
      html: `<div style="background:#DDE3E8;color:#3A0F34;padding:40px;font-family:Arial,sans-serif;max-width:520px"><p style="font-weight:bold;letter-spacing:3px">FSOCIETY PK</p><h1>One last checkpoint.</h1><p>Enter this code to verify your email and join the community.</p><p style="font-size:36px;letter-spacing:10px;font-weight:bold;border-bottom:4px solid #EAAA00;padding-bottom:24px">${code}</p><p>Expires in 10 minutes. Never share this code.</p><p>If you didn’t request this account, you can ignore this email.</p></div>`,
    });
  } catch {
    // Never log the OTP, recipient, SMTP credentials, or provider response body.
    logger.error('Verification email delivery failed.');
    throw new Error('We could not send your verification email. Please try again shortly.');
  }
};
