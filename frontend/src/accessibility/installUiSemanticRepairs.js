const textOf = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();

const repairKnownUiSemantics = (root = document) => {
  if (typeof document === 'undefined') return;

  // Creator Studio already lives inside the application shell's main landmark.
  // These legacy inner <main> elements are content regions, not page-level
  // landmarks. An explicit ARIA role removes duplicate-main semantics without
  // changing the visual component contract.
  root.querySelectorAll?.('.ebsx-setup-main, .ecbs-live-grid > main').forEach((node) => {
    node.setAttribute('role', 'region');
    if (!node.getAttribute('aria-label')) {
      node.setAttribute(
        'aria-label',
        node.classList.contains('ebsx-setup-main') ? 'Broadcast setup' : 'Live broadcast audio controls'
      );
    }
  });

  // Following artwork is itself an audio play control. Give icon/art-only
  // buttons the same accessible identity as the adjacent track title.
  root.querySelectorAll?.('button.fl-show-art:not([aria-label])').forEach((button) => {
    const row = button.closest('.fl-show-row');
    const title = textOf(row?.querySelector('.fl-show-info strong')) || 'audio';
    button.setAttribute('aria-label', `Play ${title}`);
  });

  // Broadcast Studio's compact boolean tools are rendered as visual switches
  // with only a thumb <i>. Preserve the compact UI while naming the control for
  // screen readers, voice control and automated accessibility checks.
  root.querySelectorAll?.('.ecbs-tool > button:not([aria-label])').forEach((button) => {
    const tool = button.closest('.ecbs-tool');
    const label = textOf(tool?.querySelector(':scope > span')) || 'audio setting';
    const on = button.getAttribute('aria-pressed') === 'true' || button.classList.contains('on');
    button.setAttribute('aria-label', `${label}: ${on ? 'on' : 'off'}`);
  });
};

if (typeof document !== 'undefined') {
  const run = () => repairKnownUiSemantics(document);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node?.nodeType !== Node.ELEMENT_NODE) continue;
        repairKnownUiSemantics(node.matches?.('.ebsx-setup-main, .ecbs-live-grid > main, button.fl-show-art, .ecbs-tool') ? node.parentElement || node : node);
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
