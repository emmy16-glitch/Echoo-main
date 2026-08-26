export type EarlyAccessEvent =
  | "early_access_form_viewed"
  | "early_access_form_started"
  | "early_access_consent_enabled"
  | "early_access_validation_failed"
  | "early_access_subscription_succeeded"
  | "early_access_subscription_failed";

type UmamiWindow = Window & { umami?: { track?: (event: string) => void } };

/** Emits only an anonymous event name; no email or other submitted form value is sent to analytics. */
export function trackEarlyAccess(event: EarlyAccessEvent) {
  if (typeof window === "undefined") return;
  (window as UmamiWindow).umami?.track?.(event);
}
