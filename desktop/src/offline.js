'use strict';

const retry = document.getElementById('retry');
const status = document.getElementById('status');

const setRetryReady = (message = '') => {
  if (retry) {
    retry.disabled = false;
    retry.textContent = 'Try again';
  }
  if (status) status.textContent = message;
};

retry?.addEventListener('click', async () => {
  retry.disabled = true;
  retry.textContent = 'Opening Echoo…';
  if (status) status.textContent = '';

  try {
    const result = await window.echooDesktop?.reload?.();
    if (!result?.ok) {
      setRetryReady('Echoo still couldn’t open. Check your connection, then try again.');
    }
  } catch {
    setRetryReady('Echoo still couldn’t open. Try again.');
  }
});
