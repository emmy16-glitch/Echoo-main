import { describe, expect, it } from "vitest";
import { getReleaseCopyFeedback } from "./releaseCopyFeedback";

describe("getReleaseCopyFeedback", () => {
  it("returns an immediate success confirmation without exposing a URL", () => {
    expect(getReleaseCopyFeedback("success")).toEqual({
      title: "Copied!",
      description: "The Echoo Studio v1.0.5 release link is ready to share.",
    });
  });

  it("returns a clear clipboard-failure fallback", () => {
    expect(getReleaseCopyFeedback("error").title).toBe("Copy unavailable");
  });
});
