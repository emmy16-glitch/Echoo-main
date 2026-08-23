const textOf = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();

let generatedDialogId = 0;
const dialogOpeners = new WeakMap();

const focusableIn = (root) => [...root.querySelectorAll(
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
)].filter((node) => {
  const style = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
});

const enhanceCollectionDialog = (modal) => {
  if (!modal || modal.dataset.echooDialogEnhanced === 'true') return;
  modal.dataset.echooDialogEnhanced = 'true';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const heading = modal.querySelector('h1, h2, h3');
  if (heading) {
    if (!heading.id) {
      generatedDialogId += 1;
      heading.id = `echoo-dialog-title-${generatedDialogId}`;
    }
    modal.setAttribute('aria-labelledby', heading.id);
  } else if (!modal.getAttribute('aria-label')) {
    modal.setAttribute('aria-label', 'Dialog');
  }

  const active = document.activeElement;
  if (active && active !== document.body && !modal.contains(active)) {
    dialogOpeners.set(modal, active);
  }

  queueMicrotask(() => {
    if (!document.contains(modal) || modal.contains(document.activeElement)) return;
    const first = focusableIn(modal)[0];
    first?.focus?.();
  });
};

const repairKnownUiSemantics = (root = document) => {
  if (typeof document === 'undefined') return;

  root.querySelectorAll?.('.ebsx-setup-main, .ecbs-live-grid > main').forEach((node) => {
    node.setAttribute('role', 'region');
    if (!node.getAttribute('aria-label')) {
      node.setAttribute(
        'aria-label',
        node.classList.contains('ebsx-setup-main') ? 'Broadcast setup' : 'Live broadcast audio controls'
      );
    }
  });

  root.querySelectorAll?.('button.fl-show-art:not([aria-label])').forEach((button) => {
    const row = button.closest('.fl-show-row');
    const title = textOf(row?.querySelector('.fl-show-info strong')) || 'audio';
    button.setAttribute('aria-label', `Play ${title}`);
  });

  root.querySelectorAll?.('.ecbs-tool > button:not([aria-label])').forEach((button) => {
    const tool = button.closest('.ecbs-tool');
    const label = textOf(tool?.querySelector(':scope > span')) || 'audio setting';
    const on = button.getAttribute('aria-pressed') === 'true' || button.classList.contains('on');
    button.setAttribute('aria-label', `${label}: ${on ? 'on' : 'off'}`);
  });

  // The Listener Stations sidebar used visual labels next to selects without a
  // for/id association. Give the active controls a programmatic name while
  // preserving the existing markup and layout.
  root.querySelectorAll?.('.ls-filter-group .ls-select:not([aria-label])').forEach((select) => {
    const group = select.closest('.ls-filter-group');
    const label = textOf(group?.querySelector(':scope > label'));
    if (label) select.setAttribute('aria-label', label);
  });

  root.querySelectorAll?.('.ecc-modal-backdrop .ecc-modal').forEach(enhanceCollectionDialog);
};

if (typeof document !== 'undefined') {
  const run = () => repairKnownUiSemantics(document);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  document.addEventListener('keydown', (event) => {
    const dialogs = [...document.querySelectorAll('.ecc-modal-backdrop .ecc-modal[aria-modal="true"]')];
    const modal = dialogs.at(-1);
    if (!modal) return;

    if (event.key === 'Escape') {
      const closeButton = modal.querySelector('.ecc-modal-close');
      if (closeButton && !closeButton.disabled) {
        event.preventDefault();
        const opener = dialogOpeners.get(modal);
        closeButton.click();
        queueMicrotask(() => opener?.isConnected && opener.focus?.());
      }
      return;
    }

    if (event.key !== 'Tab') return;
    const focusables = focusableIn(modal);
    if (!focusables.length) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !modal.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node?.nodeType !== Node.ELEMENT_NODE) continue;
        repairKnownUiSemantics(node.matches?.('.ebsx-setup-main, .ecbs-live-grid > main, button.fl-show-art, .ecbs-tool, .ls-filter-group, .ecc-modal-backdrop, .ecc-modal') ? node.parentElement || node : node);
      }
      if (mutation.type === 'attributes' && mutation.target?.nodeType === Node.ELEMENT_NODE) {
        repairKnownUiSemantics(mutation.target.parentElement || mutation.target);
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'aria-pressed'],
  });
}

export { repairKnownUiSemantics };
