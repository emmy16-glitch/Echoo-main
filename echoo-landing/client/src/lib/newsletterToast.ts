import { NEWSLETTER_SUCCESS_MESSAGE } from "./newsletterSubscription";

export const NEWSLETTER_SUCCESS_TOAST_DESCRIPTION = "Your consent has been recorded. We will only send confirmation when newsletter delivery is enabled.";

type SuccessToast = (message: string, options: { description: string }) => unknown;

/** Announces a successful newsletter submission without claiming email delivery is active. */
export function showNewsletterSuccessToast(successToast: SuccessToast) {
  return successToast(NEWSLETTER_SUCCESS_MESSAGE, {
    description: NEWSLETTER_SUCCESS_TOAST_DESCRIPTION,
  });
}
