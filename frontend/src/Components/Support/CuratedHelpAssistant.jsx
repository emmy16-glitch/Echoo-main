import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  FaArrowUp,
  FaCommentDots,
  FaEnvelope,
  FaQuestionCircle,
  FaShieldAlt,
  FaTimes,
} from 'react-icons/fa';
import {
  curatedHelpSuggestions,
  getCuratedHelpWelcome,
  humanSupportEmailDraft,
  resolveCuratedHelpResponse,
} from './curatedHelp';
import './CuratedHelpAssistant.css';

const RESPONSE_DELAY_MS = 260;

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
  const [isSelectingGuidance, setIsSelectingGuidance] = useState(false);
  const [escalationOpen, setEscalationOpen] = useState(false);
  const [hasEscalationConsent, setHasEscalationConsent] = useState(false);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const questionRef = useRef(null);
  const responseTimerRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const escalationId = useId();
  const dialogId = useId();
  const labels = labelsFor(mode);

  const clearResponseTimer = useCallback(() => {
    if (responseTimerRef.current !== null) {
      window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearResponseTimer();
    setOpen(false);
    setQuestion('');
    setAnswers([getCuratedHelpWelcome(mode)]);
    setIsSelectingGuidance(false);
    setEscalationOpen(false);
    setHasEscalationConsent(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [clearResponseTimer, mode]);

  useEffect(() => () => clearResponseTimer(), [clearResponseTimer]);

  useEffect(() => {
    if (!open) return undefined;

    questionRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
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
  }, [close, open]);

  const ask = (value) => {
    const trimmed = value.trim();
    if (!trimmed || isSelectingGuidance) return;

    setQuestion('');
    setIsSelectingGuidance(true);
    clearResponseTimer();
    responseTimerRef.current = window.setTimeout(() => {
      setAnswers((current) => [...current, resolveCuratedHelpResponse(trimmed, mode)]);
      setIsSelectingGuidance(false);
      responseTimerRef.current = null;
    }, RESPONSE_DELAY_MS);
  };

  const submit = (event) => {
    event.preventDefault();
    ask(question);
  };

  const openHumanSupportDraft = () => {
    if (!hasEscalationConsent) return;
    window.location.href = humanSupportEmailDraft;
    setEscalationOpen(false);
    setHasEscalationConsent(false);
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
        aria-controls={dialogId}
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
            id={dialogId}
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

            <div className="echoo-curated-help__answers" aria-live="polite" aria-busy={isSelectingGuidance}>
              {answers.map((answer, index) => (
                <article key={`${answer.topic}-${index}`} className="echoo-curated-help__answer echoo-curated-help__answer--entering">
                  <p>{answer.topic}</p>
                  <span>{answer.answer}</span>
                </article>
              ))}
              {isSelectingGuidance && (
                <div className="echoo-curated-help__typing" role="status">
                  <span className="echoo-curated-help__typing-dots" aria-hidden="true"><i /><i /><i /></span>
                  Selecting the most relevant curated guidance…
                </div>
              )}
            </div>

            <div className="echoo-curated-help__composer">
              <p id={descriptionId} className="echoo-curated-help__privacy">
                <FaShieldAlt aria-hidden="true" />
                Your question is used only to select guidance in this browser session. It is not sent to a service, persisted, or analysed.
              </p>
              <div className="echoo-curated-help__suggestions">
                {curatedHelpSuggestions[mode].map((suggestion) => (
                  <button key={suggestion} type="button" disabled={isSelectingGuidance} onClick={() => ask(suggestion)}>{suggestion}</button>
                ))}
              </div>
              <button
                type="button"
                className="echoo-curated-help__escalate"
                aria-expanded={escalationOpen}
                aria-controls={escalationId}
                onClick={() => setEscalationOpen((current) => !current)}
              >
                <FaQuestionCircle aria-hidden="true" />
                Need human support?
              </button>
              {escalationOpen && (
                <section className="echoo-curated-help__escalation" id={escalationId} aria-label="Human support consent">
                  <p>Echoo will not send your question. With your consent, this prepares an empty email draft in your mail app; you choose a verified Echoo support recipient, what to write, and whether to send it.</p>
                  <label>
                    <input type="checkbox" checked={hasEscalationConsent} onChange={(event) => setHasEscalationConsent(event.target.checked)} />
                    <span>I understand that anything I add and send is handled by my email provider, not this assistant. I will not include passwords, codes, or private room details.</span>
                  </label>
                  <button type="button" disabled={!hasEscalationConsent} onClick={openHumanSupportDraft}>
                    <FaEnvelope aria-hidden="true" />
                    Prepare email draft
                  </button>
                </section>
              )}
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
                <button type="submit" disabled={!question.trim() || isSelectingGuidance} aria-label={labels.input}>
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
