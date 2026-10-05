'use strict';

const params = new URLSearchParams(window.location.search);
const reason = String(params.get('reason') || 'startup-failed').slice(0, 160);
const detail = document.getElementById('detail');
const retry = document.getElementById('retry');

if (detail) detail.textContent = `Startup detail: ${reason}`;

retry?.addEventListener('click', async () => {
  retry.disabled = true;
  retry.textContent = 'Opening Echoo…';
  try {
    await window.echooDesktop?.reload?.();
  } catch {
    retry.disabled = false;
    retry.textContent = 'Try again';
  }
});

