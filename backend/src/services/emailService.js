import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const gmailConfigured = Boolean(
  env.gmailUser &&
    env.gmailClientId &&
    env.gmailClientSecret &&
    env.gmailRefreshToken
);

const transporter = gmailConfigured
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: env.gmailUser,
        clientId: env.gmailClientId,
        clientSecret: env.gmailClientSecret,
        refreshToken: env.gmailRefreshToken,
      },
    })
  : null;

export async function sendPasswordResetEmail({ to, resetUrl }) {
  if (!transporter || !env.mailFrom) {
    const error = new Error('Password reset email is not configured on the server.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }

  await transporter.sendMail({
    from: env.mailFrom,
    to,
    subject: 'Reset your Echoo password',
    text: `We received a request to reset your Echoo password. Use this link within 30 minutes: ${resetUrl}`,
    html: `<p>We received a request to reset your Echoo password.</p><p><a href="${resetUrl}">Reset your Echoo password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
  });
}
