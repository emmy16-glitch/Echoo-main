import { describe, expect, it } from "vitest";
import { detectPlatform } from "./downloadSelector";

describe("detectPlatform", () => {
  it("prioritizes the modern platform hint for Windows", () => {
    expect(detectPlatform({ userAgentData: { platform: "Windows" }, platform: "Linux x86_64" })).toBe("windows");
  });

  it("recognizes Linux from traditional platform values", () => {
    expect(detectPlatform({ platform: "Linux x86_64" })).toBe("linux");
  });

  it("recognizes macOS from a user agent fallback", () => {
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)" })).toBe("macos");
  });

  it("leaves unsupported platforms unknown", () => {
    expect(detectPlatform({ platform: "FreeBSD amd64" })).toBe("unknown");
  });
});
