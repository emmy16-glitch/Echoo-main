export type DetectedPlatform = "windows" | "linux" | "macos" | "unknown";

export type PlatformSignals = {
  userAgentData?: { platform?: string };
  platform?: string;
  userAgent?: string;
};

export function detectPlatform(signals: PlatformSignals | undefined): DetectedPlatform {
  const highEntropyPlatform = signals?.userAgentData?.platform || "";
  const platform = signals?.platform || "";
  const userAgent = signals?.userAgent || "";
  const value = `${highEntropyPlatform} ${platform} ${userAgent}`.toLowerCase();

  if (value.includes("win")) return "windows";
  if (value.includes("linux") || value.includes("x11")) return "linux";
  if (value.includes("mac")) return "macos";
  return "unknown";
}
