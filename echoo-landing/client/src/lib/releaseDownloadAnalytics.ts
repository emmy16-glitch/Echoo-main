export const RELEASE_DOWNLOAD_EVENTS = {
  windows: "release_download_windows_setup",
  macos: "release_download_macos_dmg",
  "linux-deb": "release_download_linux_deb",
  "linux-appimage": "release_download_linux_appimage",
  "linux-archive": "release_download_linux_archive",
} as const;

type UmamiWindow = Window & { umami?: { track?: (event: string) => void } };

/** Emits only an anonymous asset-specific event name; no identity, device, or URL parameters are collected. */
export function trackReleaseDownload(downloadId: string) {
  if (typeof window === "undefined") return;
  const event = RELEASE_DOWNLOAD_EVENTS[downloadId as keyof typeof RELEASE_DOWNLOAD_EVENTS];
  if (event) (window as UmamiWindow).umami?.track?.(event);
}
