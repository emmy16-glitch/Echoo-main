export const NEWSLETTER_CONFIRMATION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function getNewsletterConfirmationToken(search: string) {
  const token = new URLSearchParams(search).get("token") ?? "";
  return NEWSLETTER_CONFIRMATION_TOKEN_PATTERN.test(token) ? token : null;
}
