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

const requireMailer = (purpose) => {
  if (transporter && env.mailFrom) return transporter;

  const error = new Error(`${purpose} email is not configured on the server.`);
  error.code = 'EMAIL_NOT_CONFIGURED';
  error.status = 503;
  throw error;
};

export async function sendEmailVerificationCode({ to, code }) {
  const mailer = requireMailer('Email verification');

  await mailer.sendMail({
    from: env.mailFrom,
    to,
    subject: 'Verify your Echoo email',
    text: `Your Echoo verification code is ${code}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#172033">
        <h2 style="margin-bottom:8px">Verify your Echoo email</h2>
        <p style="margin-top:0">Use this code to finish creating your Echoo account:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:28px 0">${code}</p>
        <p>This code expires in 10 minutes.</p>
        <p style="color:#667085">If you did not create this account, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
  const mailer = requireMailer('Password reset');

  await mailer.sendMail({
    from: env.mailFrom,
    to,
    subject: 'Reset your Echoo password',
    text: `We received a request to reset your Echoo password. Use this link within 30 minutes: ${resetUrl}`,
    html: `<p>We received a request to reset your Echoo password.</p><p><a href="${resetUrl}">Reset your Echoo password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
  });
}
