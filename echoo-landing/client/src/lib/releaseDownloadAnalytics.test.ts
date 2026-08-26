import { afterEach, describe, expect, it, vi } from "vitest";
import { trackReleaseDownload } from "./releaseDownloadAnalytics";

describe("trackReleaseDownload", () => {
  afterEach(() => delete (globalThis as { window?: unknown }).window);

  it("forwards only the anonymous event name for a known release asset", () => {
    const track = vi.fn();
    (globalThis as { window?: unknown }).window = { umami: { track } };

    trackReleaseDownload("windows");

    expect(track).toHaveBeenCalledWith("release_download_windows_setup");
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("forwards a fixed anonymous event name for the public macOS installer", () => {
    const track = vi.fn();
    (globalThis as { window?: unknown }).window = { umami: { track } };

    trackReleaseDownload("macos");

    expect(track).toHaveBeenCalledWith("release_download_macos_dmg");
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown asset identifiers", () => {
    const track = vi.fn();
    (globalThis as { window?: unknown }).window = { umami: { track } };

    trackReleaseDownload("unknown");

    expect(track).not.toHaveBeenCalled();
  });
});
