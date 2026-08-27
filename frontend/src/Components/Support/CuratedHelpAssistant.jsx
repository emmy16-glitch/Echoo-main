import { useEffect, useId, useRef, useState } from 'react';
import {
  FaArrowUp,
  FaCommentDots,
  FaShieldAlt,
  FaTimes,
} from 'react-icons/fa';
import {
  curatedHelpSuggestions,
  getCuratedHelpWelcome,
  resolveCuratedHelpResponse,
} from './curatedHelp';
import './CuratedHelpAssistant.css';

const labelsFor = (mode) => (
  mode === 'creator'
    ? { title: 'Creator copilot', trigger: 'Open creator copilot', input: 'Ask the creator copilot' }
    : { title: 'Listener support', trigger: 'Open listener support', input: 'Ask listener support' }
);

const getFocusableElements = (container) => (
  container
    ? Array.from(container.querySelectorAll('button:not([disabled]), input:not([disabled])'))
    : []
);

const CuratedHelpAssistant = ({ mode = 'listener' }) => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(() => [getCuratedHelpWelcome(mode)]);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const questionRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const labels = labelsFor(mode);

  useEffect(() => {
    if (!open) return undefined;

    questionRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(dialogRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuestion('');
    setAnswers([getCuratedHelpWelcome(mode)]);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const ask = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setAnswers((current) => [...current, resolveCuratedHelpResponse(trimmed, mode)]);
    setQuestion('');
  };

  const submit = (event) => {
    event.preventDefault();
    ask(question);
  };

  return (
    <div className="echoo-curated-help">
      <button
        ref={triggerRef}
        type="button"
        className="echoo-curated-help__trigger"
        aria-label={labels.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <FaCommentDots aria-hidden="true" />
        <span>Help</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="echoo-curated-help__backdrop"
            aria-label={`Close ${labels.title}`}
            onClick={close}
          />
          <section
            ref={dialogRef}
            className="echoo-curated-help__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <header className="echoo-curated-help__header">
              <div>
                <p>LOCAL, CURATED GUIDANCE</p>
                <h2 id={titleId}>{labels.title}</h2>
              </div>
              <button type="button" className="echoo-curated-help__close" onClick={close} aria-label={`Close ${labels.title}`}>
                <FaTimes aria-hidden="true" />
              </button>
            </header>

            <div className="echoo-curated-help__answers" aria-live="polite">
              {answers.map((answer, index) => (
                <article key={`${answer.topic}-${index}`} className="echoo-curated-help__answer">
                  <p>{answer.topic}</p>
                  <span>{answer.answer}</span>
                </article>
              ))}
            </div>

            <div className="echoo-curated-help__composer">
              <p id={descriptionId} className="echoo-curated-help__privacy">
                <FaShieldAlt aria-hidden="true" />
                Your question is used only to select guidance in this browser session. It is not sent to a service, persisted, or analysed.
              </p>
              <div className="echoo-curated-help__suggestions">
                {curatedHelpSuggestions[mode].map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => ask(suggestion)}>{suggestion}</button>
                ))}
              </div>
              <form onSubmit={submit}>
                <label className="sr-only" htmlFor={`${titleId}-question`}>{labels.input}</label>
                <input
                  ref={questionRef}
                  id={`${titleId}-question`}
                  type="text"
                  maxLength="280"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask about Echoo…"
                />
                <button type="submit" disabled={!question.trim()} aria-label={labels.input}>
                  <FaArrowUp aria-hidden="true" />
                </button>
              </form>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default CuratedHelpAssistant;
