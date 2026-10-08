'use strict';

const { ipcRenderer } = require('electron');

const SPLASH_INTRO_CHANNEL = 'echoo:splash-intro-complete';
const SPLASH_FINISH_CHANNEL = 'echoo:splash-finish';

window.addEventListener('DOMContentLoaded', () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mark = document.querySelector('.echoo-mark');
  let sent = false;

  const complete = () => {
    if (sent) return;
    sent = true;
    ipcRenderer.send(SPLASH_INTRO_CHANNEL, { reducedMotion });
  };

  const finish = () => {
    if (sent) return;
    if (reducedMotion || !mark) {
      complete();
      return;
    }

    const handleMarkAnimationEnd = (event) => {
      // Loop animations also bubble from the coordinated SVG groups. Only the
      // readiness-driven flat-logo finish is allowed to complete the splash.
      if (event.target !== mark || event.animationName !== 'echoo-mark-finish') return;
      mark.removeEventListener('animationend', handleMarkAnimationEnd);
      complete();
    };
    mark.addEventListener('animationend', handleMarkAnimationEnd);
    document.documentElement.classList.add('splash-finishing');
  };

  ipcRenderer.once(SPLASH_FINISH_CHANNEL, finish);
}, { once: true });
