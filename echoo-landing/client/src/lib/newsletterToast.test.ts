import { describe, expect, it, vi } from "vitest";
import { NEWSLETTER_SUCCESS_MESSAGE } from "./newsletterSubscription";
import {
  NEWSLETTER_SUCCESS_TOAST_DESCRIPTION,
  showNewsletterSuccessToast,
} from "./newsletterToast";

describe("showNewsletterSuccessToast", () => {
  it("announces a successful subscription without implying delivery is active", () => {
    const successToast = vi.fn();

    showNewsletterSuccessToast(successToast);

    expect(successToast).toHaveBeenCalledWith(NEWSLETTER_SUCCESS_MESSAGE, {
      description: NEWSLETTER_SUCCESS_TOAST_DESCRIPTION,
    });
    expect(NEWSLETTER_SUCCESS_TOAST_DESCRIPTION).toContain("when newsletter delivery is enabled");
  });
});
