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

const shouldReduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const EchooExperienceOrchestrator = () => {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const root = document.documentElement;
    root.classList.add('echoo-experience-ready');

    const reduced = shouldReduceMotion();
    if (reduced) root.classList.add('echoo-reduced-motion');

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
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--echoo-pointer-x', `${event.clientX - bounds.left}px`);
      card.style.setProperty('--echoo-pointer-y', `${event.clientY - bounds.top}px`);
      card.classList.add('echoo-pointer-card');
    };

    const pointerLeave = (event) => {
      const card = event.target.closest?.(SPOTLIGHT_SELECTORS);
      const nextCard = event.relatedTarget?.closest?.(SPOTLIGHT_SELECTORS);
      if (card && card !== nextCard) card.classList.remove('echoo-pointer-active');
    };

    const pointerOver = (event) => {
      const card = event.target.closest?.(SPOTLIGHT_SELECTORS);
      if (card) card.classList.add('echoo-pointer-active', 'echoo-pointer-card');
    };

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

    return () => {
      root.classList.remove('echoo-experience-ready', 'echoo-reduced-motion');
      revealObserver?.disconnect();
      mutationObserver.disconnect();
      document.removeEventListener('pointermove', pointerMove);
      document.removeEventListener('pointerover', pointerOver);
      document.removeEventListener('pointerout', pointerLeave);
    };
  }, []);

  return null;
};

export default EchooExperienceOrchestrator;
