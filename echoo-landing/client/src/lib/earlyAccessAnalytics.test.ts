import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEarlyAccess } from "./earlyAccessAnalytics";

describe("trackEarlyAccess", () => {
  afterEach(() => delete (globalThis as { window?: unknown }).window);

  it("forwards only an anonymous success-event name", () => {
    const track = vi.fn();
    (globalThis as { window?: unknown }).window = { umami: { track } };
    trackEarlyAccess("early_access_subscription_succeeded");
    expect(track).toHaveBeenCalledWith("early_access_subscription_succeeded");
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the tracker is unavailable", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(() => trackEarlyAccess("early_access_form_viewed")).not.toThrow();
  });
});
