// Centralized Echoo email service.
//
// Every transactional email — verification, password reset, welcome, password
// change and security alerts — goes through `sendEmail`, which talks to the
// Resend API. Controllers never construct email content; they only call the
// named senders below, so there is exactly one place that knows how Echoo mail
// is delivered.
//
// Configuration (see backend/.env.example):
//   RESEND_API_KEY — Resend API key (server-only, never exposed to clients)
//   EMAIL_FROM     — verified "from" address, e.g. "Echoo <no-reply@echoo.com>"
//   FRONTEND_URL   — used to build reset links
//
// When the mailer is not configured, `sendEmail` throws an
// EMAIL_NOT_CONFIGURED error (status 503). Controllers that must not block the
// user journey (welcome email, security alerts) call the senders inside a
// try/catch and log the failure instead of failing the request.

import { Resend } from 'resend';
import { env } from '../config/env.js';
import {
  newSignInEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verificationCodeEmail,
  welcomeEmail,
} from './emailTemplates.js';

let resendClient = null;

const getClient = () => {
  if (!resendClient) {
    resendClient = new Resend(env.resendApiKey);
  }
  return resendClient;
};

export const isEmailConfigured = () => Boolean(env.resendApiKey && env.emailFrom);

const requireMailer = (purpose) => {
  if (isEmailConfigured()) return;
  const error = new Error(`${purpose} email is not configured on the server.`);
  error.code = 'EMAIL_NOT_CONFIGURED';
  error.status = 503;
  throw error;
};

// Low-level delivery. Prefer the named senders below from application code.
export async function sendEmail({ to, subject, html, text }) {
  requireMailer(subject || 'Echoo');

  const { data, error } = await getClient().emails.send({
    from: env.emailFrom,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    const sendError = new Error(
      error.message || 'The email provider could not deliver this message.'
    );
    sendError.code = 'EMAIL_SEND_FAILED';
    sendError.status = 502;
    sendError.details = error;
    throw sendError;
  }

  return data;
}

export async function sendEmailVerificationCode({ to, code }) {
  const { subject, html, text } = verificationCodeEmail({ code });
  return sendEmail({ to, subject, html, text });
}

export async function sendPasswordResetEmail({ to, resetUrl, name }) {
  const { subject, html, text } = passwordResetEmail({ name, resetUrl });
  return sendEmail({ to, subject, html, text });
}

export async function sendWelcomeEmail({ to, name }) {
  const { subject, html, text } = welcomeEmail({ name });
  return sendEmail({ to, subject, html, text });
}

export async function sendPasswordChangedEmail({ to, name }) {
  const { subject, html, text } = passwordChangedEmail({ name });
  return sendEmail({ to, subject, html, text });
}

export async function sendNewSignInEmail({ to, name, device, location }) {
  const { subject, html, text } = newSignInEmail({ name, device, location });
  return sendEmail({ to, subject, html, text });
}
