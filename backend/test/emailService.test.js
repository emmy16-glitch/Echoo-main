import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  newSignInEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verificationCodeEmail,
  welcomeEmail,
} from '../src/services/emailTemplates.js';
import { countryFromRequest, describeUserAgent } from '../src/utils/signInContext.js';
import User from '../src/models/User.js';

test('every Echoo email template renders branded HTML with its expected subject', () => {
  const reset = passwordResetEmail({
    name: 'Ada Lovelace',
    resetUrl: 'https://echoo.test/reset-password?token=abc',
  });
  assert.equal(reset.subject, 'Reset your Echoo password');
  assert.ok(reset.html.includes('https://echoo.test/reset-password?token=abc'));
  assert.match(reset.html, />Reset Password</);
  assert.match(reset.text, /expires in 15 minutes/);
  assert.match(reset.html, /Hello Ada/);

  const welcome = welcomeEmail({ name: 'Ada Lovelace' });
  assert.match(welcome.subject, /Welcome to Echoo/);
  assert.match(welcome.html, /Welcome to Echoo/);
  assert.match(welcome.html, /Create a Channel anytime/);
  assert.match(welcome.html, /Hello Ada/);

  const changed = passwordChangedEmail({ name: 'Ada Lovelace' });
  assert.equal(changed.subject, 'Your Echoo password was changed');
  assert.match(changed.html, /Password changed/);

  const signIn = newSignInEmail({
    name: 'Ada Lovelace',
    device: 'Chrome',
    location: 'Nigeria',
  });
  assert.equal(signIn.subject, 'New sign-in to your Echoo account');
  assert.ok(signIn.html.includes('Chrome'));
  assert.ok(signIn.html.includes('Nigeria'));

  const code = verificationCodeEmail({ code: '123456' });
  assert.match(code.subject, /Verify your Echoo email/);
  assert.ok(code.html.includes('123456'));
});

test('email templates escape user-controlled values to prevent HTML injection', () => {
  const payload = '<script>alert("x")</script>';
  const welcome = welcomeEmail({ name: payload });
  assert.ok(!welcome.html.includes('<script>alert'));
  assert.ok(welcome.html.includes('&lt;script&gt;'));

  const reset = passwordResetEmail({ name: payload, resetUrl: 'https://x.test/r' });
  assert.ok(!reset.html.includes('<script>alert'));
  assert.ok(reset.html.includes('&lt;script&gt;'));
});

test('sign-in context helpers describe devices and countries without exposing raw values', () => {
  assert.equal(
    describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'),
    'Chrome'
  );
  assert.equal(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Gecko/20100101 Firefox/121.0'), 'Firefox');
  assert.equal(describeUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'), 'Safari');
  assert.equal(describeUserAgent(''), 'Unknown device');

  assert.equal(countryFromRequest({ headers: { 'cf-ipcountry': 'NG' } }), 'NG');
  assert.equal(countryFromRequest({ headers: {} }), null);
  assert.equal(countryFromRequest(null), null);
});

test('the mailer reports EMAIL_NOT_CONFIGURED when Resend credentials are absent', async () => {
  // Force the unconfigured path deterministically, even on machines that have
  // a backend/.env present: dotenv never overrides pre-set process.env values.
  process.env.RESEND_API_KEY = '';
  process.env.EMAIL_FROM = '';

  const { isEmailConfigured, sendEmail } = await import('../src/services/emailService.js');

  assert.equal(isEmailConfigured(), false);

  await assert.rejects(
    () => sendEmail({ to: 'listener@example.com', subject: 'hi', html: '<p>hi</p>' }),
    (error) => error?.code === 'EMAIL_NOT_CONFIGURED' && error?.status === 503
  );
});

test('the User model stores reset-token hash, expiry, request time and single-use status', () => {
  assert.ok(User.schema.path('resetPasswordTokenHash'));
  assert.ok(User.schema.path('resetPasswordExpiresAt'));
  assert.ok(User.schema.path('resetPasswordRequestedAt'));
  assert.ok(User.schema.path('resetPasswordUsedAt'));
});

test('auth controller wires Resend senders without embedding email logic in controllers', async () => {
  const controller = await readFile(
    new URL('../src/controllers/authController.js', import.meta.url),
    'utf8'
  );

  // Forgot-password: 15-minute, single-use reset token.
  assert.match(controller, /15 \* 60 \* 1000/);
  assert.match(controller, /crypto\.randomBytes\(32\)/);
  assert.match(controller, /resetPasswordUsedAt: null/);
  assert.match(controller, /sendPasswordResetEmail/);

  // Reset: marks the token used and confirms by email.
  assert.match(controller, /resetPasswordUsedAt = new Date\(\)/);
  assert.match(controller, /sendPasswordChangedEmail/);

  // Signup: best-effort welcome email (never blocks registration).
  assert.match(controller, /sendWelcomeEmail/);

  // Login: optional security notification.
  assert.match(controller, /sendNewSignInEmail/);
  assert.match(controller, /env\.newSigninAlertsEnabled/);
});
