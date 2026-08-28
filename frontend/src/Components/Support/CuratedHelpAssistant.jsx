import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FaArrowUp,
  FaBroadcastTower,
  FaCloudUploadAlt,
  FaCog,
  FaCommentDots,
  FaCompass,
  FaEnvelope,
  FaHeart,
  FaHistory,
  FaMicrophone,
  FaPlay,
  FaQuestionCircle,
  FaShieldAlt,
  FaTimes,
} from 'react-icons/fa';
import {
  getCuratedHelpWelcome,
  humanSupportEmailDraft,
  resolveCuratedHelpResponse,
} from './curatedHelp';
import { useOptionalCreatorStudioState } from '../CreatorStudio/CreatorStudioState';
import { getCreatorCopilotState } from '../CreatorStudio/creatorCopilotState';
import './CuratedHelpAssistant.css';

const RESPONSE_DELAY_MS = 220;

const getFocusableElements = (container) => (
  container
    ? Array.from(container.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]'))
    : []
);

const listenerPageFromPath = (pathname = '') => {
  if (pathname === '/listen' || pathname === '/listen/') return 'Home';
  if (pathname.startsWith('/listen/live')) return 'Live now';
  if (pathname.startsWith('/listen/stations')) return 'Stations';
  if (pathname.includes('/library/following')) return 'Following';
  if (pathname.includes('/history')) return 'History';
  if (pathname.includes('/settings')) return 'Settings';
  if (pathname.includes('/library')) return 'Audio library';
  return 'Listening';
};

const listenerGuidanceFor = (page) => {
  switch (page) {
    case 'Live now':
      return {
        title: 'Find a live conversation that fits your mood.',
        intro: 'Browse what is happening now, open a live room, or jump to stations you already follow.',
        actions: [
          { id: 'live', icon: <FaBroadcastTower />, title: 'See what’s live', body: 'Browse public broadcasts happening right now.', label: 'Explore', destination: '/listen/live' },
          { id: 'following', icon: <FaHeart />, title: 'Check your following', body: 'See stations you already chose to keep up with.', label: 'Open', destination: '/listen/library/following' },
        ],
        suggestions: ['What’s live now?', 'How do I join a live room?', 'Show me stations I follow', 'Help with playback'],
      };
    case 'Stations':
      return {
        title: 'Discover stations worth coming back to.',
        intro: 'Browse public stations, follow creators you like, and use search when you already know what you want.',
        actions: [
          { id: 'stations', icon: <FaCompass />, title: 'Browse public stations', body: 'Explore creator stations across Echoo.', label: 'Browse', destination: '/listen/stations' },
          { id: 'following', icon: <FaHeart />, title: 'Your following', body: 'Return to stations you already follow.', label: 'Open', destination: '/listen/library/following' },
        ],
        suggestions: ['Find technology stations', 'How do I follow a station?', 'Show stations I follow', 'How do I search Echoo?'],
      };
    case 'Following':
      return {
        title: 'Keep up with the stations you chose.',
        intro: 'Use Following as your shortcut back to creators and stations you already care about.',
        actions: [
          { id: 'following', icon: <FaHeart />, title: 'Review your following', body: 'Open the stations you currently follow.', label: 'Open', destination: '/listen/library/following' },
          { id: 'discover', icon: <FaCompass />, title: 'Find something new', body: 'Browse more public stations across Echoo.', label: 'Discover', destination: '/listen/stations' },
        ],
        suggestions: ['Where are stations I follow?', 'Find something similar', 'What’s live now?', 'Help with playback'],
      };
    case 'History':
      return {
        title: 'Pick up where you left off.',
        intro: 'Use your history to return to recent listening, then explore something similar when you want a change.',
        actions: [
          { id: 'history', icon: <FaHistory />, title: 'Open listening history', body: 'Return to recently played Echoo audio.', label: 'Open', destination: '/listen/history' },
          { id: 'stations', icon: <FaCompass />, title: 'Browse stations', body: 'Find another creator or community to follow.', label: 'Browse', destination: '/listen/stations' },
        ],
        suggestions: ['Where is my listening history?', 'How do I continue listening?', 'Find something similar', 'Help with playback'],
      };
    case 'Settings':
      return {
        title: 'Tune Echoo to the way you listen.',
        intro: 'Review your profile, playback preferences, and listener settings from one place.',
        actions: [
          { id: 'settings', icon: <FaCog />, title: 'Listener settings', body: 'Review your profile and playback preferences.', label: 'Open', destination: '/listen/settings' },
          { id: 'history', icon: <FaHistory />, title: 'Listening history', body: 'Return to recently played audio.', label: 'Open', destination: '/listen/history' },
        ],
        suggestions: ['Where are my settings?', 'How do I change playback settings?', 'Why will audio not play?', 'How do notifications work?'],
      };
    default:
      return {
        title: 'Find something worth hearing.',
        intro: 'Explore live conversations, browse public stations, or return to something you were listening to earlier.',
        actions: [
          { id: 'live', icon: <FaBroadcastTower />, title: 'See what’s live', body: 'Explore public broadcasts happening right now.', label: 'Explore', destination: '/listen/live' },
          { id: 'stations', icon: <FaCompass />, title: 'Browse stations', body: 'Find creators and communities across Echoo.', label: 'Browse', destination: '/listen/stations' },
        ],
        suggestions: ['What’s live now?', 'Find technology stations', 'Show stations I follow', 'Help with playback'],
      };
  }
};

const CuratedHelpAssistant = ({ mode = 'listener', page = 'Home', onNavigate }) => {
  const creatorState = useOptionalCreatorStudioState();
  const navigate = useNavigate();
  const location = useLocation();
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

  const isCreator = mode === 'creator';
  const resolvedPage = isCreator ? page : listenerPageFromPath(location.pathname);
  const copilotState = getCreatorCopilotState(isCreator ? creatorState : {});
  const { hasStation, hasAudio, hasUpcoming, isLive, setupComplete } = copilotState;

  const creatorIntro = isLive
    ? 'Monitor your live session, check your connection, and keep the audience engaged.'
    : hasStation
      ? hasUpcoming ? 'Review your upcoming session or prepare your live setup.' : 'Plan a broadcast, refine your station, or prepare audio.'
      : 'Create your first station, then prepare your audio and first live session.';

  const creatorActions = isCreator ? [
    hasStation
      ? { id: 'broadcast', icon: <FaMicrophone />, title: isLive ? 'Open live studio' : 'Prepare your next broadcast', body: isLive ? 'Monitor your mix and audience in Broadcast Studio.' : 'Review your station and get ready to go live.', label: isLive ? 'Open' : 'Prepare', destination: 'Broadcast' }
      : { id: 'station', icon: <FaBroadcastTower />, title: 'Create your first station', body: 'Set up the home for your broadcasts.', label: 'Start', destination: 'Stations' },
    hasAudio
      ? { id: 'audio', icon: <FaCloudUploadAlt />, title: 'Manage your audio', body: 'Review recent uploads and prepare them for a broadcast.', label: 'Open', destination: 'Audio' }
      : { id: 'audio', icon: <FaMicrophone />, title: 'Check your audio setup', body: 'Make sure your microphone and monitoring are ready.', label: 'Check', destination: 'Broadcast' },
  ] : [];

  const listenerGuidance = useMemo(() => listenerGuidanceFor(resolvedPage), [resolvedPage]);
  const initialTitle = isCreator ? copilotState.title : listenerGuidance.title;
  const initialIntro = isCreator ? creatorIntro : listenerGuidance.intro;
  const initialActions = isCreator ? creatorActions : listenerGuidance.actions;
  const initialSuggestions = isCreator ? copilotState.suggestions : listenerGuidance.suggestions;

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
    const eventName = isCreator ? 'echoo:open-creator-copilot' : 'echoo:open-listener-copilot';
    const openCopilot = () => setOpen(true);
    window.addEventListener(eventName, openCopilot);
    return () => window.removeEventListener(eventName, openCopilot);
  }, [isCreator]);

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

  const runAction = (action) => {
    if (isCreator) onNavigate?.(action.destination);
    else navigate(action.destination);
    close();
  };

  return (
    <div className={`echoo-curated-help echoo-curated-help--${mode}`}>
      <button
        ref={triggerRef}
        type="button"
        className="echoo-curated-help__trigger"
        aria-label={`Open ${isCreator ? 'Creator' : 'Listener'} Copilot`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen(true)}
      >
        <FaCommentDots aria-hidden="true" />
        <span>Copilot</span>
      </button>

      {open && (
        <>
          <button type="button" className="echoo-curated-help__backdrop" aria-label="Close Echoo Copilot" onClick={close} />
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
                <h2 id={titleId}>Echoo Copilot</h2>
                <p>{isCreator ? 'Creator assistant' : 'Listener assistant'}</p>
              </div>
              <button type="button" className="echoo-curated-help__close" onClick={close} aria-label="Close Echoo Copilot"><FaTimes /></button>
            </header>

            {answers.length <= 1 ? (
              <div className="echoo-curated-help__start" aria-live="polite">
                <div className="echoo-curated-help__context">
                  <span>{resolvedPage}</span>
                  {isCreator && <span className={setupComplete ? 'complete' : ''}>{setupComplete ? 'Setup complete' : 'Setup incomplete'}</span>}
                </div>
                <p className="echoo-curated-help__greeting">{isCreator ? (isLive ? 'Live guidance' : 'Creator guidance') : 'Listener guidance'}</p>
                <h3>{initialTitle}</h3>
                <p>{initialIntro}</p>
                <div className="echoo-curated-help__action-cards">
                  {initialActions.map((action) => (
                    <article key={action.id}>
                      <i>{action.icon}</i>
                      <div><strong>{action.title}</strong><span>{action.body}</span></div>
                      <button type="button" onClick={() => runAction(action)}>{action.label} <FaArrowUp /></button>
                    </article>
                  ))}
                </div>
                <h4>Suggested for you</h4>
                <div className="echoo-curated-help__suggestions echoo-curated-help__suggestions--contextual">
                  {initialSuggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)}>{suggestion}</button>)}
                </div>
              </div>
            ) : (
              <div className="echoo-curated-help__answers" aria-live="polite" aria-busy={isSelectingGuidance}>
                {answers.slice(1).map((answer, index) => (
                  <article key={`${answer.topic}-${index}`} className="echoo-curated-help__answer echoo-curated-help__answer--entering">
                    <p>{answer.topic}</p>
                    <span>{answer.answer}</span>
                  </article>
                ))}
                {isSelectingGuidance && <div className="echoo-curated-help__typing" role="status"><span className="echoo-curated-help__typing-dots" aria-hidden="true"><i /><i /><i /></span>Selecting the most relevant guidance…</div>}
              </div>
            )}

            <div className="echoo-curated-help__composer">
              <p id={descriptionId} className="echoo-curated-help__privacy"><FaShieldAlt /> Local guidance · Your questions stay in this browser session.</p>
              <button type="button" className="echoo-curated-help__escalate" aria-expanded={escalationOpen} aria-controls={escalationId} onClick={() => setEscalationOpen((current) => !current)}>
                <FaQuestionCircle /> Need human support?
              </button>
              {escalationOpen && (
                <section className="echoo-curated-help__escalation" id={escalationId} aria-label="Human support consent">
                  <p>Echoo will not send your question. With your consent, this prepares an empty email draft in your mail app; you choose what to write and whether to send it.</p>
                  <label><input type="checkbox" checked={hasEscalationConsent} onChange={(event) => setHasEscalationConsent(event.target.checked)} /><span>I understand that anything I add and send is handled by my email provider. I will not include passwords, codes, or private room details.</span></label>
                  <button type="button" disabled={!hasEscalationConsent} onClick={openHumanSupportDraft}><FaEnvelope /> Prepare email draft</button>
                </section>
              )}
              <form onSubmit={submit}>
                <label className="sr-only" htmlFor={`${titleId}-question`}>Ask Echoo Copilot</label>
                <input ref={questionRef} id={`${titleId}-question`} type="text" maxLength="280" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={isCreator ? 'Ask about creating on Echoo…' : 'Ask about listening on Echoo…'} />
                <button type="submit" disabled={!question.trim() || isSelectingGuidance} aria-label="Ask Echoo Copilot"><FaArrowUp /></button>
              </form>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default CuratedHelpAssistant;
