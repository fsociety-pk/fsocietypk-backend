import { Notification } from '../models/Notification';
import mongoose from 'mongoose';

export interface NotificationPayload {
  userId: mongoose.Types.ObjectId | string;
  type: 'challenge_submitted' | 'challenge_approved' | 'challenge_rejected' | 'challenge_solved';
  title: string;
  message: string;
  challengeId?: mongoose.Types.ObjectId | string;
  data?: Record<string, any>;
}

export const createNotification = async (payload: NotificationPayload) => {
  try {
    const notification = await Notification.create({
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      challengeId: payload.challengeId,
      data: payload.data,
    });

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Notification templates
export const notificationTemplates = {
  challengeSubmitted: (challengeTitle: string) => ({
    type: 'challenge_submitted',
    title: 'Challenge Submitted',
    message: `Your challenge "${challengeTitle}" has been submitted for review. Admins will review it shortly.`,
  }),

  challengeApproved: (challengeTitle: string) => ({
    type: 'challenge_approved',
    title: 'Challenge Approved',
    message: `Your challenge "${challengeTitle}" has been approved and is now live! Users can solve it.`,
  }),

  challengeRejected: (challengeTitle: string, reason?: string) => ({
    type: 'challenge_rejected',
    title: 'Challenge Rejected',
    message: `Your challenge "${challengeTitle}" was rejected. ${reason ? `Reason: ${reason}` : 'Please review and resubmit.'}`,
  }),

  challengeSubmissionNotification: (username: string, challengeTitle: string) => ({
    type: 'challenge_submitted',
    title: 'New Challenge Submission',
    message: `${username} submitted a new challenge: "${challengeTitle}"`,
  }),

  challengeSolved: (challengeTitle: string, username?: string) => ({
    type: 'challenge_solved',
    title: 'Challenge Solved',
    message: `${username ? `${username} has` : 'You have'} successfully solved "${challengeTitle}"!`,
  }),
};
