export const NEWSLETTER_CONSENT_MESSAGE =
  "Please confirm that Echoo can email you about future releases.";

export const NEWSLETTER_SUCCESS_MESSAGE =
  "Check your email to confirm future Echoo release updates.";

export const NEWSLETTER_EMAIL_MESSAGE =
  "Enter a valid email address to get future release updates.";

export function validateNewsletterEmail(email: string) {
  const normalizedEmail = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ? null
    : NEWSLETTER_EMAIL_MESSAGE;
}

export function validateNewsletterConsent(hasConsent: boolean) {
  return hasConsent ? null : NEWSLETTER_CONSENT_MESSAGE;
}
