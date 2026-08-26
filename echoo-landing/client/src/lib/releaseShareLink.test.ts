import { describe, expect, it } from "vitest";
import { buildReleaseShareLink } from "./releaseShareLink";

describe("buildReleaseShareLink", () => {
  it("constructs a canonical, version-specific release URL", () => {
    expect(buildReleaseShareLink("https://echoo.example")).toBe(
      "https://echoo.example/release?release=v1.0.5#downloads"
    );
  });

  it("keeps the supplied version in the shareable release URL", () => {
    expect(buildReleaseShareLink("http://localhost:5173", "v2.0.0")).toBe(
      "http://localhost:5173/release?release=v2.0.0#downloads"
    );
  });
});
