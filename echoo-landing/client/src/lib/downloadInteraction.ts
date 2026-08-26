export type DownloadInteractionState = {
  activeDownloadId: string | null;
  isStarting: boolean;
};

export const idleDownloadInteraction: DownloadInteractionState = {
  activeDownloadId: null,
  isStarting: false,
};

export function startDownloadInteraction(downloadId: string): DownloadInteractionState {
  return { activeDownloadId: downloadId, isStarting: true };
}

export function isDownloadStarting(state: DownloadInteractionState, downloadId: string): boolean {
  return state.isStarting && state.activeDownloadId === downloadId;
}
