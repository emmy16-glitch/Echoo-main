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

  mark.addEventListener('animationend', (event) => {
    if (event.animationName === 'echoo-mark-arrive') complete();
  }, { once: true });
}, { once: true });
