import { useEffect } from 'react';

const REVEAL_SELECTORS = [
  '.echoo-onboarding-redesign .eor-panel > *',
  '.echoo-onboarding-redesign .eor-role-card',
  '.echoo-onboarding-redesign .eor-hero-copy',
  '.echoo-onboarding-redesign .eor-audio-card',
  '.echoo-onboarding-redesign .eor-profile-hero-card',
  '.auth-page .auth-card',
  '.echoo-broadcast-login-hero',
  '.echoo-broadcast-form-card',
  '.ehome > section',
  '.ehome article',
  '.studio-view > *',
  '.studio-view section',
  '.studio-view article',
  '.studio-alert',
  '.studio-upload-modal',
  '.creator-settings-real-header',
  '.creator-settings-tabs',
  '.creator-settings-real-card',
  '.creator-settings-real-toggle',
  '.echoo-reference-page > section',
  '.echoo-reference-page article',
  '.echoo-reference-page .ref-state-card',
  '.ref-page-heading',
  '.ref-settings-nav',
  '.ref-settings-card',
  '.ln-header',
  '.ln-item',
  '.ln-empty',
  '.llr-hero',
  '.llr-chat-shell',
].join(',');

const SPOTLIGHT_SELECTORS = [
  '.eor-role-card',
  '.echoo-broadcast-form-card',
  '.ref-feature-audio-card',
  '.ref-creator-tile',
  '.ref-home-station-card',
  '.ref-station-card',
  '.ref-library-card',
  '.ref-history-card',
  '.ref-download-card',
  '.ref-settings-card',
  '.ln-item',
  '.creator-settings-real-card',
  '.ehome-station-card',
  '.ehome-live-command',
  '.studio-upload-modal',
  '.llr-chat-shell',
  '.llr-hero',
  '.ebsx-chat-card',
  '.ebsx-activity-card',
  '.ebsx-live-controls',
].join(',');

const PAGE_ROOT_SELECTORS = [
  '.echoo-onboarding-redesign',
  '.auth-page',
  '.echoo-broadcast-login-page',
  '.studio-view > *',
  '.layout-content > *',
].join(',');

const TOOLTIP_SELECTORS = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="link"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const shouldReduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const normalizeTooltipText = (value = '') =>
  String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

const getControlLabel = (element) => {
  if (!(element instanceof HTMLElement)) return '';

  const explicit =
    element.dataset.echooTooltip ||
    element.getAttribute('aria-label') ||
    element.getAttribute('title');
  if (explicit) return normalizeTooltipText(explicit);

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelledText = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ');
      if (normalizeTooltipText(labelledText)) return normalizeTooltipText(labelledText);
    }

    const label = element.labels?.[0]?.textContent;
    if (normalizeTooltipText(label)) return normalizeTooltipText(label);

    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return normalizeTooltipText(placeholder);

    const name = element.getAttribute('name');
    if (name) return normalizeTooltipText(name.replace(/[-_]+/g, ' '));
  }

  const visibleText = normalizeTooltipText(element.innerText || element.textContent || '');
  if (visibleText) return visibleText;

  const describedBy = element.getAttribute('aria-describedby');
  if (describedBy) {
    const description = describedBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ');
    if (normalizeTooltipText(description)) return normalizeTooltipText(description);
  }

  return '';
};

const EchooExperienceOrchestrator = () => {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const root = document.documentElement;
    root.classList.add('echoo-experience-ready');

    const reduced = shouldReduceMotion();
    if (reduced) root.classList.add('echoo-reduced-motion');

    const tooltip = document.createElement('div');
    tooltip.className = 'echoo-global-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltip);

    let tooltipTarget = null;
    let tooltipTimer = null;

    const cancelTooltipTimer = () => {
      if (!tooltipTimer) return;
      window.clearTimeout(tooltipTimer);
      tooltipTimer = null;
    };

    const hideTooltip = () => {
      cancelTooltipTimer();
      tooltipTarget = null;
      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
    };

    const positionTooltip = ({ clientX = null, clientY = null, target = null } = {}) => {
      const padding = 10;
      const gap = 12;
      const targetRect = target?.getBoundingClientRect?.();
      const desiredX = Number.isFinite(clientX)
        ? clientX + gap
        : (targetRect?.left || padding) + Math.min(targetRect?.width || 0, 28);
      const desiredY = Number.isFinite(clientY)
        ? clientY + gap
        : (targetRect?.bottom || padding) + 8;

      const bounds = tooltip.getBoundingClientRect();
      const maxLeft = Math.max(padding, window.innerWidth - bounds.width - padding);
      const maxTop = Math.max(padding, window.innerHeight - bounds.height - padding);

      tooltip.style.left = `${Math.min(Math.max(padding, desiredX), maxLeft)}px`;
      tooltip.style.top = `${Math.min(Math.max(padding, desiredY), maxTop)}px`;
    };

    const showTooltip = (target, pointer = null) => {
      const label = getControlLabel(target);
      if (!label) {
        hideTooltip();
        return;
      }

      cancelTooltipTimer();
      tooltipTarget = target;
      tooltip.textContent = label;
      tooltip.setAttribute('aria-hidden', 'false');
      tooltipTimer = window.setTimeout(() => {
        if (tooltipTarget !== target || !target.isConnected) return;
        tooltip.classList.add('visible');
        positionTooltip({
          clientX: pointer?.clientX,
          clientY: pointer?.clientY,
          target,
        });
      }, 90);
    };

    const findTooltipTarget = (eventTarget) => {
      if (!(eventTarget instanceof Element)) return null;
      const target = eventTarget.closest(TOOLTIP_SELECTORS);
      if (!(target instanceof HTMLElement)) return null;
      if (target.closest('.echoo-global-tooltip')) return null;
      return target;
    };

    const observed = new WeakSet();
    const revealObserver = reduced || !('IntersectionObserver' in window)
      ? null
      : new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add('echoo-inview-visible');
              revealObserver?.unobserve(entry.target);
            });
          },
          { threshold: 0.08, rootMargin: '0px 0px -5% 0px' }
        );

    const prepareElement = (element, index = 0) => {
      if (!(element instanceof HTMLElement) || observed.has(element)) return;
      observed.add(element);
      element.classList.add('echoo-inview');
      element.style.setProperty('--echoo-reveal-index', String(index % 8));

      if (reduced || !revealObserver) {
        element.classList.add('echoo-inview-visible');
        return;
      }

      revealObserver.observe(element);
    };

    const prepareReveal = (scope = document) => {
      const elements = [];
      if (scope instanceof HTMLElement && scope.matches?.(REVEAL_SELECTORS)) {
        elements.push(scope);
      }
      scope.querySelectorAll?.(REVEAL_SELECTORS).forEach((element) => elements.push(element));
      elements.forEach(prepareElement);
    };

    const animatePageRoots = (scope = document) => {
      const roots = [];
      if (scope instanceof HTMLElement && scope.matches?.(PAGE_ROOT_SELECTORS)) roots.push(scope);
      scope.querySelectorAll?.(PAGE_ROOT_SELECTORS).forEach((element) => roots.push(element));

      roots.forEach((element) => {
        element.classList.remove('echoo-page-enter');
        void element.offsetWidth;
        element.classList.add('echoo-page-enter');
      });
    };

    const pointerMove = (event) => {
      const card = event.target.closest?.(SPOTLIGHT_SELECTORS);
      if (card) {
        const bounds = card.getBoundingClientRect();
        card.style.setProperty('--echoo-pointer-x', `${event.clientX - bounds.left}px`);
        card.style.setProperty('--echoo-pointer-y', `${event.clientY - bounds.top}px`);
        card.classList.add('echoo-pointer-card');
      }

      if (tooltipTarget && event.pointerType !== 'touch') {
        positionTooltip({ clientX: event.clientX, clientY: event.clientY, target: tooltipTarget });
      }
    };

    const pointerLeave = (event) => {
      const card = event.target.closest?.(SPOTLIGHT_SELECTORS);
      const nextCard = event.relatedTarget?.closest?.(SPOTLIGHT_SELECTORS);
      if (card && card !== nextCard) card.classList.remove('echoo-pointer-active');

      const currentTarget = findTooltipTarget(event.target);
      const nextTarget = findTooltipTarget(event.relatedTarget);
      if (currentTarget && currentTarget === tooltipTarget && currentTarget !== nextTarget) {
        hideTooltip();
      }
    };

    const pointerOver = (event) => {
      const card = event.target.closest?.(SPOTLIGHT_SELECTORS);
      if (card) card.classList.add('echoo-pointer-active', 'echoo-pointer-card');

      if (event.pointerType === 'touch') return;
      const target = findTooltipTarget(event.target);
      if (target && target !== tooltipTarget) showTooltip(target, event);
    };

    const focusIn = (event) => {
      const target = findTooltipTarget(event.target);
      if (target) showTooltip(target);
    };

    const focusOut = (event) => {
      const target = findTooltipTarget(event.target);
      const nextTarget = findTooltipTarget(event.relatedTarget);
      if (target && target === tooltipTarget && target !== nextTarget) hideTooltip();
    };

    const keyDown = (event) => {
      if (event.key === 'Escape') hideTooltip();
    };

    const click = () => hideTooltip();
    const scroll = () => hideTooltip();

    prepareReveal();
    animatePageRoots();

    const mutationObserver = new MutationObserver((mutations) => {
      let shouldAnimateRoots = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          prepareReveal(node);
          if (node.matches?.(PAGE_ROOT_SELECTORS) || node.querySelector?.(PAGE_ROOT_SELECTORS)) {
            shouldAnimateRoots = true;
          }
        });
      });

      if (shouldAnimateRoots) {
        window.requestAnimationFrame(() => animatePageRoots());
      }
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointermove', pointerMove, { passive: true });
    document.addEventListener('pointerover', pointerOver, { passive: true });
    document.addEventListener('pointerout', pointerLeave, { passive: true });
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('keydown', keyDown);
    document.addEventListener('click', click, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true, capture: true });

    return () => {
      root.classList.remove('echoo-experience-ready', 'echoo-reduced-motion');
      revealObserver?.disconnect();
      mutationObserver.disconnect();
      hideTooltip();
      tooltip.remove();
      document.removeEventListener('pointermove', pointerMove);
      document.removeEventListener('pointerover', pointerOver);
      document.removeEventListener('pointerout', pointerLeave);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('click', click);
      window.removeEventListener('scroll', scroll, true);
    };
  }, []);

  return null;
};

export default EchooExperienceOrchestrator;
