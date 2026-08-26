import { describe, expect, it } from "vitest";
import { BACK_TO_TOP_SCROLL_THRESHOLD, shouldShowBackToTop } from "./backToTop";

describe("shouldShowBackToTop", () => {
  it("keeps the control hidden before the page reaches the long-content threshold", () => {
    expect(shouldShowBackToTop(BACK_TO_TOP_SCROLL_THRESHOLD - 1)).toBe(false);
  });

  it("shows the control at and after the threshold", () => {
    expect(shouldShowBackToTop(BACK_TO_TOP_SCROLL_THRESHOLD)).toBe(true);
    expect(shouldShowBackToTop(BACK_TO_TOP_SCROLL_THRESHOLD + 640)).toBe(true);
  });
});
