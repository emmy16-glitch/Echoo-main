import { describe, expect, it } from "vitest";
import {
  buildNewsletterConfirmationUrl,
  createNewsletterConfirmationToken,
  hashNewsletterConfirmationToken,
  isNewsletterConfirmationWindowOpen,
  resolveNewsletterDeliveryConfig,
} from "./newsletterDelivery";

describe("newsletter confirmation helpers", () => {
  it("creates a non-plaintext-safe token representation for persistence", () => {
    const token = createNewsletterConfirmationToken();

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(hashNewsletterConfirmationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashNewsletterConfirmationToken(token)).not.toBe(token);
  });

  it("builds a canonical confirmation URL without subscriber data", () => {
    const url = buildNewsletterConfirmationUrl("https://echoo.example", "a".repeat(64));

    expect(url).toBe(`https://echoo.example/newsletter/confirm?token=${"a".repeat(64)}`);
    expect(url).not.toContain("email");
  });

  it("rejects expired confirmation windows", () => {
    const now = new Date("2026-08-26T15:00:00.000Z");

    expect(isNewsletterConfirmationWindowOpen(new Date("2026-08-28T15:00:00.000Z"), now)).toBe(true);
    expect(isNewsletterConfirmationWindowOpen(new Date("2026-08-26T15:00:00.000Z"), now)).toBe(false);
  });

  it("requires a verified sender and secure public confirmation origin", () => {
    expect(() => resolveNewsletterDeliveryConfig({})).toThrow("not active yet");
    expect(() => resolveNewsletterDeliveryConfig({
      newsletterDeliveryEnabled: true,
      resendApiKey: "re_test",
      resendFromEmail: "updates@echoo.example",
      newsletterConfirmationOrigin: "http://echoo.example",
    })).toThrow("secure public HTTPS origin");
    expect(resolveNewsletterDeliveryConfig({
      newsletterDeliveryEnabled: true,
      resendApiKey: "re_test",
      resendFromEmail: "updates@echoo.example",
      newsletterConfirmationOrigin: "https://echoo.example",
    })).toEqual({
      apiKey: "re_test",
      fromEmail: "updates@echoo.example",
      confirmationOrigin: "https://echoo.example",
    });
  });
});
