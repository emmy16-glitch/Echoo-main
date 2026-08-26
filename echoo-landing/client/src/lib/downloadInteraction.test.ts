import { describe, expect, it } from "vitest";
import { idleDownloadInteraction, isDownloadStarting, startDownloadInteraction } from "./downloadInteraction";

describe("download interaction", () => {
  it("marks only the clicked download as starting", () => {
    const state = startDownloadInteraction("linux-deb");

    expect(isDownloadStarting(state, "linux-deb")).toBe(true);
    expect(isDownloadStarting(state, "windows")).toBe(false);
  });

  it("keeps an idle download state free from loading indicators", () => {
    expect(isDownloadStarting(idleDownloadInteraction, "macos")).toBe(false);
  });
});
