const TAB_CONTENT_HEIGHT = 58;
const MINIMUM_BOTTOM_PADDING = 8;

export function getListenerTabBarMetrics(bottomInset: number) {
  const bottomPadding = Math.max(MINIMUM_BOTTOM_PADDING, bottomInset);
  return {
    bottomPadding,
    height: TAB_CONTENT_HEIGHT + bottomPadding,
  };
}
