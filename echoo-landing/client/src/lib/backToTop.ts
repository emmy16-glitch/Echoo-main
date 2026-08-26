export const BACK_TO_TOP_SCROLL_THRESHOLD = 480;

export function shouldShowBackToTop(scrollY: number, threshold = BACK_TO_TOP_SCROLL_THRESHOLD) {
  return scrollY >= threshold;
}
