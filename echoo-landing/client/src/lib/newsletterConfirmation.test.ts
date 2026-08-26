import { describe, expect, it } from "vitest";
import { getNewsletterConfirmationToken } from "./newsletterConfirmation";

describe("getNewsletterConfirmationToken", () => {
  it("accepts only the expected opaque confirmation token", () => {
    expect(getNewsletterConfirmationToken(`?token=${"a".repeat(64)}`)).toBe("a".repeat(64));
    expect(getNewsletterConfirmationToken("?token=too-short")).toBeNull();
    expect(getNewsletterConfirmationToken("?email=person%40example.com")).toBeNull();
  });
});
