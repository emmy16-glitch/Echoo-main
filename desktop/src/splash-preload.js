'use strict';

const { ipcRenderer } = require('electron');

const SPLASH_INTRO_CHANNEL = 'echoo:splash-intro-complete';

window.addEventListener('DOMContentLoaded', () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mark = document.querySelector('.echoo-mark');
  let sent = false;

  const complete = () => {
    if (sent) return;
    sent = true;
    ipcRenderer.send(SPLASH_INTRO_CHANNEL, { reducedMotion });
  };

  if (reducedMotion || !mark) {
    complete();
    return;
  }

  const handleMarkAnimationEnd = (event) => {
    // animationend bubbles from the independently moving SVG groups. Only the
    // mark's own 3D-to-2D settle completes the intro; otherwise a child event
    // could consume the listener and leave startup waiting for the fallback.
    if (event.target !== mark || event.animationName !== 'echoo-mark-arrive') return;
    mark.removeEventListener('animationend', handleMarkAnimationEnd);
    complete();
  };
  mark.addEventListener('animationend', handleMarkAnimationEnd);
}, { once: true });
