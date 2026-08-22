import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiBookmark,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiMessageCircle,
  FiPlay,
  FiRadio,
  FiSearch,
  FiSend,
  FiShare2,
  FiUsers,
} from 'react-icons/fi';

import EchooButton from '../../design-system/EchooButton';
import './ListenerExperienceComponents.css';

const WAVEFORM_VALUES = [18,32,26,45,68,36,55,77,42,60,29,48,72,51,36,66,84,48,62,31,58,73,44,69,35,52,80,46,64,38,56,75,43,67,33,54,82,49,70,40,59,78,45,63,34,50,74,41,61,30,47,69,39,57,28,44,65,37,53,25,42,62,35,50,23,40,58,32,48,21,38,55,30,45];

const Waveform = ({ progress = 0, live = false, onSeek, label = 'Audio timeline' }) => (
  <div className="lex-waveform-wrap">
    <div
      className={`lex-waveform${live ? ' is-live' : ''}`}
      role={live ? 'img' : 'slider'}
      aria-label={label}
      aria-valuemin={live ? undefined : 0}
      aria-valuemax={live ? undefined : 100}
      aria-valuenow={live ? undefined : Math.round(progress)}
      tabIndex={live ? undefined : 0}
      onClick={(event) => {
        if (!onSeek || live) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)));
      }}
      onKeyDown={(event) => {
        if (!onSeek || live) return;
        if (event.key === 'ArrowLeft') onSeek(Math.max(0, progress - 2));
        if (event.key === 'ArrowRight') onSeek(Math.min(100, progress + 2));
      }}
    >
      {WAVEFORM_VALUES.map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={live || index / WAVEFORM_VALUES.length <= progress / 100 ? 'is-active' : ''}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  </div>
);

const LiveRoomHeader = ({ show, joined, following, onJoin, onFollow, onShare }) => (
  <section className="lex-room-header" aria-labelledby="live-room-title">
    <div className="lex-room-header__copy">
      <span className="lex-live-badge"><FiRadio aria-hidden="true" /> LIVE NOW</span>
      <h1 id="live-room-title">{show.title}</h1>
      <strong className="lex-category">{show.category}</strong>
      <p>{show.description}</p>
      <div className="lex-creator-line">
        <span className="lex-avatar">{show.creator?.charAt(0) || 'E'}</span>
        <span><strong>{show.creator}</strong><small>{show.handle}</small></span>
        {show.verified && <FiCheck className="lex-verified" aria-label="Verified" />}
        <span className="lex-listener-count"><FiUsers aria-hidden="true" /> {Number(show.listenerCount).toLocaleString()} listening</span>
      </div>
      <div className="lex-header-actions">
        <EchooButton onClick={onJoin} icon={<FiRadio />}>{joined ? 'Joined' : 'Join live'}</EchooButton>
        <EchooButton variant="secondary" onClick={onFollow} icon={<FiCheck />}>{following ? 'Following' : 'Follow'}</EchooButton>
        <EchooButton variant="secondary" onClick={onShare} icon={<FiShare2 />}>Share</EchooButton>
      </div>
    </div>
    <div className="lex-room-header__art">
      <img src={show.artwork} alt="" />
      <span className="lex-live-badge lex-live-badge--art"><FiRadio aria-hidden="true" /> LIVE</span>
      <Waveform live label="Live audio waveform" />
    </div>
  </section>
);

const TranscriptPanel = ({ segments = [], live = false, loading = false, status = '', onJump, onSearch, onSave, savedSegmentIds }) => {
  const [query, setQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const segmentListRef = useRef(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || onSearch) return segments;
    return segments.filter((segment) => `${segment.speaker} ${segment.text}`.toLowerCase().includes(needle));
  }, [onSearch, query, segments]);
  useEffect(() => {
    if (!onSearch) return undefined;
    const timer = window.setTimeout(() => onSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [onSearch, query]);
  useEffect(() => {
    if (!live || !autoScroll || query || !segmentListRef.current) return;
    segmentListRef.current.scrollTo({ top: segmentListRef.current.scrollHeight, behavior: 'smooth' });
  }, [autoScroll, live, query, segments]);
  const stateLabel = status === 'failed'
    ? 'Transcript disconnected'
    : status === 'reconnecting' || status === 'connecting' || status === 'starting'
      ? 'Transcript reconnecting'
      : status === 'completed'
        ? 'Transcript finalized'
        : 'Transcript connected';

  return (
    <section className="lex-panel lex-transcript" aria-labelledby="transcript-panel-title">
      <div className="lex-panel__header">
        <div><h2 id="transcript-panel-title">{live ? 'Live Transcript' : 'Transcript'}</h2><span>{live ? 'Updating as the conversation happens' : 'Search and jump to any moment'}</span></div>
        {(live || status === 'completed') && <span className="lex-transcript-state"><i /> {stateLabel}</span>}
      </div>
      <label className="lex-panel-search"><FiSearch aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transcript..." /></label>
      {live && <label className="lex-transcript-autoscroll"><input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} /> Auto-scroll</label>}
      <div className="lex-transcript__segments" ref={segmentListRef}>
        {loading && <div className="lex-panel-empty">Loading transcript...</div>}
        {filtered.map((segment) => {
          const isSaved = Boolean(savedSegmentIds?.has?.(String(segment.id)));
          return <article className={`lex-transcript-segment is-${segment.state || 'final'}`} key={segment.id}>
            <button type="button" className="lex-transcript-segment__jump" onClick={() => onJump?.(segment.seconds)}>
              <time>{segment.time}</time>
              <span><strong>{segment.speaker}</strong><p>{segment.text}</p>{segment.state === 'partial' && <small>Listening...</small>}</span>
            </button>
            {onSave && segment.state !== 'partial' && <button type="button" className={`lex-transcript-segment__save${isSaved ? ' is-saved' : ''}`} onClick={() => onSave(segment)} disabled={isSaved} aria-label={isSaved ? 'Saved moment' : 'Save this moment'}><FiBookmark /></button>}
          </article>;
        })}
        {!loading && !filtered.length && <div className="lex-panel-empty">{query ? `No transcript moments match “${query}”.` : 'Transcript moments will appear here.'}</div>}
      </div>
      <p className="lex-transcript-note">AI captions may not be 100% accurate.</p>
    </section>
  );
};

const ChatPanel = ({ initialMessages = [], messages: controlledMessages, onSend, onReact, loading = false, disabled = false, error = '' }) => {
  const [localMessages, setLocalMessages] = useState(initialMessages);
  const [text, setText] = useState('');
  const messages = controlledMessages ?? localMessages;
  const send = async (event) => {
    event.preventDefault();
    const content = text.trim();
    if (!content || disabled) return;
    if (onSend) {
      const sent = await onSend(content);
      if (sent !== false) setText('');
      return;
    }
    setLocalMessages((current) => [...current, { id: `local-${Date.now()}`, name: 'You', time: 'Now', text: content, reaction: '' }]);
    setText('');
  };
  return (
    <section className="lex-panel lex-chat" aria-labelledby="chat-panel-title">
      <div className="lex-panel__header"><div><h2 id="chat-panel-title">Live Chat</h2><span>Community conversation</span></div><FiMessageCircle aria-hidden="true" /></div>
      <div className="lex-chat__messages">
        {loading && <div className="lex-panel-empty">Loading live chat...</div>}
        {messages.map((message) => (
          <article className="lex-chat-message" key={message.id}>
            <span className="lex-avatar lex-avatar--sm">{String(message.name || 'E').charAt(0)}</span>
            <div><span><strong>{message.name}</strong><time>{message.time}</time></span><p>{message.text}</p>{message.reaction && <button type="button" onClick={() => onReact?.(message, '❤️')} aria-label={`Like ${message.name}'s message`}><FiBookmark aria-hidden="true" /> {message.reaction}</button>}</div>
          </article>
        ))}
        {!loading && !messages.length && <div className="lex-panel-empty">Be the first to join the conversation.</div>}
      </div>
      {error && <p className="lex-chat-error" role="status">{error}</p>}
      <form className="lex-chat-composer" onSubmit={send}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Message live chat..." maxLength={280} disabled={disabled} /><button type="submit" aria-label="Send message" disabled={disabled || !text.trim()}><FiSend /></button></form>
    </section>
  );
};

const ChapterList = ({ chapters = [], onJump }) => (
  <section className="lex-panel lex-chapters" aria-labelledby="chapter-list-title">
    <div className="lex-panel__header"><div><h2 id="chapter-list-title">Chapters</h2><span>Move through the conversation</span></div></div>
    <div>
      {chapters.map((chapter) => (
        <button type="button" key={chapter.id} onClick={() => onJump?.(chapter.seconds)}>
          <span className="lex-chapter-play"><FiPlay /></span>
          <span><strong>{chapter.title}</strong><small>{chapter.description}</small></span>
          <time>{chapter.time}</time><FiChevronRight aria-hidden="true" />
        </button>
      ))}
    </div>
  </section>
);

const KeyMomentCard = ({ moment, onJump, onSave, saved = false }) => (
  <article className="lex-key-moment">
    <button type="button" className="lex-key-moment__jump" onClick={() => onJump?.(moment.seconds)}>
      <time><FiClock aria-hidden="true" /> {moment.time}</time><p>“{moment.quote}”</p>
    </button>
    <button type="button" className={`lex-key-moment__save${saved ? ' is-saved' : ''}`} onClick={() => onSave?.(moment)} aria-label={saved ? 'Saved moment' : 'Save moment'} disabled={saved}>
      <FiBookmark aria-hidden="true" />
    </button>
  </article>
);

export { ChapterList, ChatPanel, KeyMomentCard, LiveRoomHeader, TranscriptPanel, Waveform };
