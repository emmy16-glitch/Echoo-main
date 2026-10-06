'use strict';

const retry = document.getElementById('retry');
const restart = document.getElementById('restart');
const diagnostics = document.getElementById('diagnostics');
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

restart?.addEventListener('click', async () => {
  restart.disabled = true;
  if (status) status.textContent = 'Restarting Echoo...';
  try {
    const result = await window.echooDesktop?.restart?.();
    if (!result?.restarted) {
      restart.disabled = false;
      if (status) status.textContent = 'Echoo could not restart while audio work is active.';
    }
  } catch {
    restart.disabled = false;
    if (status) status.textContent = 'Echoo could not restart. Close it and open it again from Start.';
  }
});

diagnostics?.addEventListener('click', async () => {
  diagnostics.disabled = true;
  try {
    const result = await window.echooDesktop?.openLogsFolder?.();
    if (!result?.opened && status) status.textContent = 'Echoo could not open its diagnostics folder.';
  } catch {
    if (status) status.textContent = 'Echoo could not open its diagnostics folder.';
  } finally {
    diagnostics.disabled = false;
  }
});
