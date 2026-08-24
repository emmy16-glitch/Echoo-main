const SEEK_STEP_SECONDS = 5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const targetSecondsForKey = (event, current, max) => {
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return current - SEEK_STEP_SECONDS;
    case 'ArrowRight':
    case 'ArrowUp':
      return current + SEEK_STEP_SECONDS;
    case 'Home':
      return 0;
    case 'End':
      return max;
    default:
      return null;
  }
};

const handlePlayerSliderKeyDown = (event) => {
  const slider = event.target?.closest?.('.layout-player-progress[role="slider"]');
  if (!slider || event.target !== slider) return;

  const max = Math.max(0, Number(slider.getAttribute('aria-valuemax')) || 0);
  const current = clamp(Number(slider.getAttribute('aria-valuenow')) || 0, 0, max);
  const requested = targetSecondsForKey(event, current, max);
  if (requested === null || max <= 0) return;

  event.preventDefault();
  const next = clamp(requested, 0, max);
  const rect = slider.getBoundingClientRect();
  if (!rect.width) return;

  slider.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + (next / max) * rect.width,
    clientY: rect.top + rect.height / 2,
  }));
};

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', handlePlayerSliderKeyDown);
}

export { handlePlayerSliderKeyDown };