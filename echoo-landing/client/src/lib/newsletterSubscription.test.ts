import { describe, expect, it } from "vitest";
import {
  NEWSLETTER_CONSENT_MESSAGE,
  NEWSLETTER_EMAIL_MESSAGE,
  NEWSLETTER_SUCCESS_MESSAGE,
  validateNewsletterEmail,
  validateNewsletterConsent,
} from "./newsletterSubscription";

describe("validateNewsletterConsent", () => {
  it("requires explicit consent before a newsletter subscription is submitted", () => {
    expect(validateNewsletterConsent(false)).toBe(NEWSLETTER_CONSENT_MESSAGE);
  });

  it("allows a consented newsletter subscription to continue", () => {
    expect(validateNewsletterConsent(true)).toBeNull();
  });

  it("rejects invalid email input before it can be submitted", () => {
    expect(validateNewsletterEmail("not-an-email")).toBe(
      NEWSLETTER_EMAIL_MESSAGE,
    );
    expect(validateNewsletterEmail("  hello@echoo.example ")).toBeNull();
  });

  it("keeps the successful subscription feedback explicit and user-facing", () => {
    expect(NEWSLETTER_SUCCESS_MESSAGE).toBe(
      "Check your email to confirm future Echoo release updates.",
    );
  });
});
