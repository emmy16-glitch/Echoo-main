import { useCallback, useEffect, useRef, useState } from 'react';
import './ConfirmDialogHost.css';

let confirmationDispatcher = null;
const earlyRequests = [];

export const requestEchooConfirmation = ({
  title = 'Confirm action',
  description = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
} = {}) => new Promise((resolve) => {
  const request = {
    id: `echoo-confirm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    description,
    confirmLabel,
    cancelLabel,
    tone,
    resolve,
    restoreFocus:
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
  };

  if (confirmationDispatcher) confirmationDispatcher(request);
  else earlyRequests.push(request);
});

export default function ConfirmDialogHost() {
  const [queue, setQueue] = useState([]);
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const current = queue[0] || null;

  const enqueue = useCallback((request) => {
    setQueue((items) => [...items, request]);
  }, []);

  useEffect(() => {
    confirmationDispatcher = enqueue;
    if (earlyRequests.length) {
      const buffered = earlyRequests.splice(0, earlyRequests.length);
      setQueue((items) => [...items, ...buffered]);
    }
    return () => {
      if (confirmationDispatcher === enqueue) confirmationDispatcher = null;
    };
  }, [enqueue]);

  const finish = useCallback((accepted) => {
    if (!current) return;
    try {
      current.resolve(Boolean(accepted));
    } finally {
      setQueue((items) => items.slice(1));
      window.requestAnimationFrame(() => {
        if (current.restoreFocus?.isConnected) current.restoreFocus.focus();
      });
    }
  }, [current]);

  useEffect(() => {
    if (!current) return undefined;

    window.requestAnimationFrame(() => cancelRef.current?.focus());

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [...(dialogRef.current?.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ) || [])].filter((element) => element.getClientRects().length > 0);

      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [current, finish]);

  if (!current) return null;

  const titleId = `${current.id}-title`;
  const descriptionId = `${current.id}-description`;

  return (
    <div
      className="echoo-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) finish(false);
      }}
    >
      <section
        ref={dialogRef}
        className="echoo-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className={`echoo-confirm-dialog__signal is-${current.tone}`} aria-hidden="true" />
        <div className="echoo-confirm-dialog__copy">
          <h2 id={titleId}>{current.title}</h2>
          <p id={descriptionId}>{current.description}</p>
        </div>
        <div className="echoo-confirm-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="echoo-confirm-dialog__cancel"
            onClick={() => finish(false)}
          >
            {current.cancelLabel}
          </button>
          <button
            type="button"
            className={`echoo-confirm-dialog__confirm is-${current.tone}`}
            onClick={() => finish(true)}
          >
            {current.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
