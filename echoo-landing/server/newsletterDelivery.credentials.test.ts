import { describe, expect, it } from "vitest";
import { verifyNewsletterDeliveryCredentials } from "./newsletterDelivery";

describe("configured newsletter delivery credentials", () => {
  const runCredentialCheck = process.env.NEWSLETTER_DELIVERY_ENABLED === "true";

  it.skipIf(!runCredentialCheck)("can read the Resend domain list and confirms the configured sender domain is verified", async () => {
    await expect(verifyNewsletterDeliveryCredentials()).resolves.toMatchObject({
      senderDomain: expect.any(String),
    });
  }, 15_000);
});
