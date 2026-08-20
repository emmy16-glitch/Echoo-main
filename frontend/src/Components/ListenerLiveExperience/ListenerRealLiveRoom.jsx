import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FaBell,
  FaBellSlash,
  FaCheckCircle,
  FaComments,
  FaExpand,
  FaHeart,
  FaPaperPlane,
  FaTv,
  FaShieldAlt,
  FaShare,
  FaSmile,
  FaSyncAlt,
  FaTimes,
  FaUsers,
  FaCalendar,
  FaEllipsisH,
  FaHeadphones,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import batch4Service, {
  normalizeChatMessage,
} from '../../services/batch4Service';
import followService from '../../services/followService';
import realtimeService from '../../services/realtimeService';
import { CHAT_EMOJIS, REACTION_EMOJIS } from '../../constants/liveChatEmoji';
import LiveKitListenerPlayer from './LiveKitListenerPlayer';
import './ListenerLiveRoom.css';
import '../../styles/live-chat-interactions.css';

const currentUser = () => {
  try {
    const raw = JSON.parse(localStorage.getItem('user') || '{}');
    return {
      ...raw,
      id: raw.id || raw._id || raw.userId || null,
      displayName:
        raw.displayName || raw.fullname || raw.username || 'Echoo Listener',
    };
  } catch {
    return { id: null, displayName: 'Echoo Listener' };
  }
};

const sameId = (first, second) =>
  Boolean(first && second && String(first) === String(second));

const timeLabel = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const clockLabel = (value) => {
  if (!value) return 'Not started';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not started';
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatListeners = (count) => {
  const value = Number(count) || 0;
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(value);
};

const upcomingLabel = (startTime, fallbackLabel) => {
  if (!startTime) return fallbackLabel || '';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return fallbackLabel || '';
  const day = date.toLocaleString([], { weekday: 'short' });
  const time = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${day} · ${time}`;
};

const ListenerRealLiveRoom = () => {
  const { broadcastId } = useParams();
  const navigate = useNavigate();
  const user = useMemo(() => currentUser(), []);

  const [broadcast, setBroadcast] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [presence, setPresence] = useState({
    listenerCount: 0,
    peakListeners: 0,
    creatorConnected: false,
  });
  const [upcoming, setUpcoming] = useState([]);
  const [followingState, setFollowingState] = useState({
    loading: true,
    following: false,
  });
  const [chatTab, setChatTab] = useState('chat');
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactionMessageId, setReactionMessageId] = useState('');
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionId, setActionId] = useState('');
  const [realtimeState, setRealtimeState] = useState('connecting');
  const [error, setError] = useState('');
  const [shareState, setShareState] = useState('');
  const chatEndRef = useRef(null);

  const isLive = broadcast?.status === 'live';
  const isScheduled = broadcast?.status === 'scheduled';
  const chatAvailable = isLive || isScheduled;
  const ended = broadcast
    ? ['completed', 'cancelled', 'failed'].includes(broadcast.status)
    : false;

  const stationId = broadcast?.stationId || broadcast?.station?.id || null;
  const stationArtwork =
    broadcast?.coverArt ||
    broadcast?.artwork ||
    broadcast?.station?.coverArt ||
    broadcast?.station?.brandCover ||
    null;
  const stationFollowers = Number(
    broadcast?.followers ??
      broadcast?.station?.followerCount ??
      broadcast?.station?.followers ??
      0
  ) || 0;

  const mergeMessage = useCallback((incoming) => {
    const normalized = normalizeChatMessage(incoming);
    if (!normalized?.id) return;

    setMessages((current) => {
      const index = current.findIndex((item) => sameId(item.id, normalized.id));
      if (index === -1) return [...current, normalized];
      const next = [...current];
      next[index] = { ...current[index], ...normalized };
      return next;
    });
  }, []);

  const loadBroadcast = useCallback(async () => {
    const response = await batch3Service.getBroadcast(broadcastId);
    if (!response?.data) throw new Error('Broadcast not found.');
    setBroadcast(response.data);
    return response.data;
  }, [broadcastId]);

  const refreshPresence = useCallback(async () => {
    try {
      const next = await batch3Service.getPresence(broadcastId);
      setPresence(next);
      setBroadcast((current) =>
        current
          ? {
              ...current,
              listenerCount: Number(next.listenerCount) || 0,
              peakListeners: Number(next.peakListeners) || 0,
            }
          : current
      );
    } catch {
      // Live audio should continue if a metadata refresh fails.
    }
  }, [broadcastId]);

  const loadChat = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setChatLoading(true);

      try {
        const [messageResult, pinnedResult] = await Promise.all([
          batch4Service.getMessages(broadcastId, { limit: 100 }),
          batch4Service.getPinned(broadcastId),
        ]);

        setMessages(Array.isArray(messageResult?.data) ? messageResult.data : []);
        setPinned(Array.isArray(pinnedResult?.data) ? pinnedResult.data : []);
      } catch (chatError) {
        if (!silent) {
          setError(chatError?.message || 'Could not load Live Chat.');
        }
      } finally {
        if (!silent) setChatLoading(false);
      }
    },
    [broadcastId]
  );

  const loadFollowingState = useCallback(async () => {
    if (!stationId) {
      setFollowingState({ loading: false, following: false });
      return;
    }
    try {
      const response = await followService.getFollowingStations();
      const list = Array.isArray(response?.data) ? response.data : [];
      const following = list.some((item) => sameId(item.id, stationId));
      setFollowingState({ loading: false, following });
    } catch {
      setFollowingState({ loading: false, following: false });
    }
  }, [stationId]);

  const loadUpcoming = useCallback(async () => {
    if (!stationId) {
      setUpcoming([]);
      return;
    }
    try {
      const response = await batch3Service.getUpcomingForStation(stationId);
      const list = Array.isArray(response?.data) ? response.data : [];
      setUpcoming(
        list
          .filter((item) => !sameId(item.id, broadcastId))
          .slice(0, 5)
      );
    } catch {
      setUpcoming([]);
    }
  }, [broadcastId, stationId]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const next = await loadBroadcast();

        if (!active) return;

        if (['live', 'scheduled'].includes(next.status)) {
          await Promise.all([loadChat(), refreshPresence()]);
        } else {
          setChatLoading(false);
        }

        await Promise.all([loadFollowingState(), loadUpcoming()]);
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Could not load this broadcast.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [
    loadBroadcast,
    loadChat,
    loadFollowingState,
    loadUpcoming,
    refreshPresence,
  ]);

  useEffect(() => {
    if (!broadcast?.id || !chatAvailable) return undefined;

    let active = true;
    let socket = null;
    let fallbackInterval = null;

    const startFallback = () => {
      if (fallbackInterval) return;
      fallbackInterval = window.setInterval(() => {
        loadChat({ silent: true });
        loadBroadcast().catch(() => {});
        refreshPresence();
      }, 15000);
    };

    const connectRealtime = async () => {
      try {
        setRealtimeState('connecting');
        socket = await realtimeService.joinBroadcast(broadcast.id);
        if (!active) return;

        setRealtimeState('connected');

        const onMessage = (payload) => mergeMessage(payload);
        const onDeleted = ({ messageId }) => {
          setMessages((current) =>
            current.filter((item) => !sameId(item.id, messageId))
          );
          setPinned((current) =>
            current.filter((item) => !sameId(item.id, messageId))
          );
        };
        const onReaction = ({ messageId, reactions } = {}) => {
          if (!messageId || !Array.isArray(reactions)) return;
          setMessages((current) => current.map((item) =>
            sameId(item.id, messageId) ? { ...item, reactions } : item
          ));
        };
        const onPinned = () => loadChat({ silent: true });
        const onStatus = (payload) => {
          if (!sameId(payload?.broadcastId, broadcast.id)) return;
          setBroadcast((current) =>
            current
              ? {
                  ...current,
                  status: payload.status || current.status,
                  startedAt: payload.startedAt ?? current.startedAt,
                  endedAt: payload.endedAt ?? current.endedAt,
                  listenerCount:
                    payload.listenerCount ?? current.listenerCount,
                  peakListeners: payload.peakListeners ?? current.peakListeners,
                }
              : current
          );
        };
        const onPresence = () => refreshPresence();
        const onDisconnect = () => {
          if (!active) return;
          setRealtimeState('reconnecting');
          startFallback();
        };
        const onConnect = () => {
          if (!active) return;
          setRealtimeState('connected');
          if (fallbackInterval) {
            window.clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
          socket.emit('broadcast:join', { broadcastId: broadcast.id });
          loadChat({ silent: true });
          refreshPresence();
        };

        socket.on('chat:message', onMessage);
        socket.on('chat:messageDeleted', onDeleted);
        socket.on('chat:reaction', onReaction);
        socket.on('chat:messagePinned', onPinned);
        socket.on('broadcast:status', onStatus);
        socket.on('presence:changed', onPresence);
        socket.on('disconnect', onDisconnect);
        socket.on('connect', onConnect);

        socket.__echooCleanup = () => {
          socket.off('chat:message', onMessage);
          socket.off('chat:messageDeleted', onDeleted);
          socket.off('chat:reaction', onReaction);
          socket.off('chat:messagePinned', onPinned);
          socket.off('broadcast:status', onStatus);
          socket.off('presence:changed', onPresence);
          socket.off('disconnect', onDisconnect);
          socket.off('connect', onConnect);
        };
      } catch (realtimeError) {
        if (!active) return;
        console.warn('Echoo realtime fallback:', realtimeError);
        setRealtimeState('fallback');
        startFallback();
      }
    };

    connectRealtime();

    return () => {
      active = false;
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      socket?.__echooCleanup?.();
      realtimeService.leaveBroadcast(broadcast.id).catch(() => {});
    };
  }, [
    broadcast?.id,
    chatAvailable,
    loadBroadcast,
    loadChat,
    mergeMessage,
    refreshPresence,
  ]);

  useEffect(() => {
    if (chatLoading) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, chatLoading]);

  const appendEmoji = (emoji) => {
    setText((current) => {
      const next = `${current}${emoji}`;
      return next.length <= 500 ? next : current;
    });
    setEmojiOpen(false);
  };

  const send = async (event) => {
    event.preventDefault();
    const content = text.trim();
    if (!content || sending || !chatAvailable) return;

    try {
      setSending(true);
      setError('');
      const response = await batch4Service.sendMessage(broadcastId, content);
      if (response?.data) mergeMessage(response.data);
      setText('');
      setEmojiOpen(false);
    } catch (sendError) {
      setError(sendError?.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  const react = async (message, emoji) => {
    if (!message?.id || actionId) return;
    try {
      setActionId(`reaction:${message.id}`);
      const response = await batch4Service.react(message.id, emoji);
      const reactions = response?.data?.reactions;
      if (Array.isArray(reactions)) {
        setMessages((current) => current.map((item) =>
          sameId(item.id, message.id) ? { ...item, reactions } : item
        ));
      } else if (realtimeState !== 'connected') {
        await loadChat({ silent: true });
      }
      setReactionMessageId('');
    } catch (reactionError) {
      setError(reactionError?.message || 'Could not update the reaction.');
    } finally {
      setActionId('');
    }
  };

  const toggleFollow = async () => {
    if (!stationId || followingState.loading || actionId) return;
    try {
      setActionId('follow');
      const wasFollowing = followingState.following;
      setFollowingState((current) => ({ ...current, following: !wasFollowing }));
      if (wasFollowing) {
        await followService.unfollowStation(stationId);
      } else {
        await followService.followStation(stationId);
      }
    } catch {
      setFollowingState((current) => ({
        ...current,
        following: current.following,
      }));
      setError('Could not update your follow status.');
    } finally {
      setActionId('');
    }
  };

  const shareBroadcast = async () => {
    if (actionId) return;
    try {
      setActionId('share');
      await navigator.clipboard.writeText(window.location.href);
      setShareState('Link copied');
      window.setTimeout(() => setShareState(''), 2000);
    } catch {
      setShareState('Could not copy the link');
      window.setTimeout(() => setShareState(''), 2000);
    } finally {
      setActionId('');
    }
  };

  const startedAtLabel = clockLabel(
    broadcast?.startedAt || broadcast?.startTime
  );

  const elapsedLabel = useMemo(() => {
    const started = broadcast?.startedAt || broadcast?.startTime;
    if (!started || !isLive) return '';
    const start = new Date(started).getTime();
    if (Number.isNaN(start)) return '';
    const seconds = Math.floor((Date.now() - start) / 1000);
    if (seconds < 0) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const pad = (value) => String(value).padStart(2, '0');
    return hours > 0
      ? `${pad(hours)}:${pad(minutes)}:${pad(remainder)}`
      : `${pad(minutes)}:${pad(remainder)}`;
  }, [broadcast?.startedAt, broadcast?.startTime, isLive, presence.listenerCount]);

  const listenersCount = Number(
    presence.listenerCount || broadcast?.listenerCount || 0
  );

  if (loading) {
    return (
      <main className="llr-page">
        <div className="llr-state">Loading broadcast...</div>
      </main>
    );
  }

  if (!broadcast) {
    return (
      <main className="llr-page">
        <button
          type="button"
          className="llr-back"
          onClick={() => navigate('/listen/live')}
        >
          <FaTimes /> Live
        </button>
        <div className="llr-state">
          <strong>Broadcast unavailable</strong>
          <span>{error || 'This broadcast could not be loaded.'}</span>
        </div>
      </main>
    );
  }

  return (
    <main className="llr-page">
      <header className="llr-topbar">
        <div className="llr-topbar-left">
          <h1 className="llr-room-title">{broadcast.title}</h1>
          <FaCheckCircle className="llr-verified" title="Verified station" aria-hidden="true" />
        </div>
        <div className="llr-topbar-meta">
          <span className="llr-live-pill"><i /> LIVE NOW</span>
          <span className="llr-meta-item">
            <FaUsers /> {listenersCount} listening
          </span>
          <span className="llr-category-pill">
            {broadcast.category || 'Other'}
          </span>
        </div>
        <div className="llr-topbar-actions">
          <button
            type="button"
            className="llr-action-btn"
            onClick={shareBroadcast}
            disabled={Boolean(actionId)}
          >
            <FaShare /> {shareState || 'Share'}
          </button>
          <button
            type="button"
            className="llr-action-btn llr-icon-only"
            title="More options"
            aria-label="More options"
            disabled
          >
            <FaEllipsisH />
          </button>
        </div>
      </header>

      {error && <div className="llr-message error">{error}</div>}

      <div className="llr-grid">
        <section className="llr-main">
          <article className="llr-player-card">
            <div className="llr-player-visual">
              {stationArtwork ? (
                <img className="llr-player-bg" src={stationArtwork} alt="" />
              ) : (
                <div className="llr-player-placeholder">
                  <FaHeadphones />
                </div>
              )}
              <span className="llr-player-live">
                <i /> LIVE
              </span>
              <div className="llr-player-overlay">
                <span className="llr-player-title">{broadcast.title}</span>
                <span className="llr-player-subtitle">
                  {broadcast.description || 'Live audio on Echoo.'}
                </span>
              </div>
            </div>

            <div className="llr-player-controls">
              {isLive && (
                <LiveKitListenerPlayer broadcastId={broadcast.id} isLive />
              )}
              <div className="llr-controls-right">
                <span className="llr-controls-live-label"><i /> LIVE</span>
                <div className="llr-controls-icons">
                  <button type="button" className="llr-ctrl-icon" title="Picture in picture" aria-label="Picture in picture">
                    <FaTv />
                  </button>
                  <button type="button" className="llr-ctrl-icon" title="Like this broadcast" aria-label="Like this broadcast">
                    <FaHeart />
                  </button>
                  <button type="button" className="llr-ctrl-icon" title="Fullscreen" aria-label="Fullscreen">
                    <FaExpand />
                  </button>
                </div>
              </div>
            </div>
          </article>

          <section className="llr-tabs-shell">
            <nav className="llr-tabs" aria-label="Broadcast details">
              <button type="button" className="llr-tab llr-tab-active">
                Details
              </button>
              <button type="button" className="llr-tab">
                Schedule
              </button>
              <button type="button" className="llr-tab">
                About station
              </button>
            </nav>

            <div className="llr-details-grid">
              <article className="llr-card llr-station-card">
                <div className="llr-station-head">
                  <img
                    className="llr-station-art"
                    src={stationArtwork}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="llr-station-info">
                    <div className="llr-station-name-row">
                      <strong>{broadcast.stationName}</strong>
                      <FaCheckCircle className="llr-verified-sm" />
                    </div>
                    <span className="llr-station-category">
                      {broadcast.category || 'Other'}
                    </span>
                    <span className="llr-station-followers">
                      {formatListeners(stationFollowers)} followers
                    </span>
                  </div>
                  <div className="llr-station-actions">
                    <button
                      type="button"
                      className={`llr-follow-btn ${followingState.following ? 'llr-following' : ''}`}
                      onClick={toggleFollow}
                      disabled={followingState.loading || Boolean(actionId)}
                    >
                      {followingState.loading
                        ? '...'
                        : followingState.following
                          ? 'Following'
                          : 'Follow'}
                    </button>
                    <button
                      type="button"
                      className="llr-follow-btn llr-follow-btn-icon"
                      title="Live notifications for this station — coming soon"
                      aria-label="Station notifications"
                      disabled
                    >
                      <FaBell />
                    </button>
                  </div>
                </div>

                <p className="llr-station-lead">
                  {broadcast.description || 'Live audio on Echoo.'}
                </p>
                <p className="llr-station-body">
                  {broadcast.description
                    ? broadcast.description
                    : 'Join the conversation and be part of this live broadcast on Echoo.'}
                </p>

                {Array.isArray(broadcast.tags) && broadcast.tags.length > 0 && (
                  <div className="llr-tags">
                    {broadcast.tags.slice(0, 6).map((tag) => (
                      <span key={tag} className="llr-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </article>

              <article className="llr-card llr-listeners-card">
                <span className="llr-card-label">Listeners</span>
                <div className="llr-listeners-big">
                  {listenersCount}
                  <span>Listening now</span>
                </div>
                <div className="llr-listeners-stats">
                  <div className="llr-stat">
                    <span>Peak today</span>
                    <strong>
                      {Number(presence.peakListeners || broadcast?.peakListeners) || listenersCount}
                    </strong>
                  </div>
                  <div className="llr-stat">
                    <span>Started</span>
                    <strong>{startedAtLabel}</strong>
                  </div>
                  <div className="llr-stat">
                    <span>Duration</span>
                    <strong>{elapsedLabel || '—'}</strong>
                  </div>
                </div>
              </article>
            </div>

            <section className="llr-up-next">
              <div className="llr-up-next-head">
                <h2>Up next on this station</h2>
                {stationId && (
                  <button
                    type="button"
                    className="llr-view-schedule"
                    onClick={() =>
                      navigate(
                        `/listen/stations${stationId ? `?station=${encodeURIComponent(stationId)}` : ''}`
                      )
                    }
                  >
                    View schedule →
                  </button>
                )}
              </div>

              {upcoming.length === 0 ? (
                <div className="llr-up-next-empty">
                  No upcoming broadcasts scheduled on this station yet.
                </div>
              ) : (
                <ul className="llr-up-next-list">
                  {upcoming.map((item) => (
                    <li key={item.id} className="llr-up-next-row">
                      <img
                        className="llr-up-next-art"
                        src={item.coverArt || item.artwork || stationArtwork}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="llr-up-next-copy">
                        <strong>{item.title}</strong>
                        <span>
                          {upcomingLabel(
                            item.startTime || item.startAt,
                            'Time not set'
                          )}
                        </span>
                      </div>
                      <div className="llr-up-next-actions">
                        <button
                          type="button"
                          className="llr-up-next-icon"
                          title="Add to calendar"
                          aria-label="Add to calendar"
                          disabled
                        >
                          <FaCalendar />
                        </button>
                        <button
                          type="button"
                          className="llr-up-next-icon"
                          title="More options"
                          aria-label="More options"
                          disabled
                        >
                          <FaEllipsisH />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>
        </section>

        <aside className="llr-chat-panel">
          <nav className="llr-chat-tabs" aria-label="Live chat views">
            <button
              type="button"
              className={`llr-chat-tab ${chatTab === 'chat' ? 'llr-chat-tab-active' : ''}`}
              onClick={() => setChatTab('chat')}
            >
              Live chat
            </button>
            <button
              type="button"
              className={`llr-chat-tab ${chatTab === 'listeners' ? 'llr-chat-tab-active' : ''}`}
              onClick={() => setChatTab('listeners')}
            >
              Listeners ({listenersCount})
            </button>
          </nav>

          {chatTab === 'listeners' ? (
            <div className="llr-listeners-view">
              <div className="llr-listeners-view-empty">
                <FaUsers />
                <strong>{listenersCount} listening now</strong>
                <span>
                  The full listeners directory will appear as more listeners join.
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="llr-messages">
                {chatLoading ? (
                  <div className="llr-chat-empty">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="llr-chat-empty">
                    <FaComments />
                    <strong>No messages yet</strong>
                    <span>Be the first to join the conversation.</span>
                  </div>
                ) : (
                  <>
                    {pinned.length > 0 && (
                      <article className="llr-message-row llr-pinned">
                        <div className="llr-message-body">
                          <div className="llr-message-topline">
                            <strong>Pinned</strong>
                            <span className="llr-pin-label">
                              {pinned[0].displayName}: {pinned[0].content}
                            </span>
                          </div>
                        </div>
                      </article>
                    )}
                    {messages.map((message) => {
                      const own = sameId(message.userId, user.id);
                      const reactionGroups = REACTION_EMOJIS.map((emoji) => {
                        const matching = (message.reactions || []).filter(
                          (reaction) => reaction.emoji === emoji
                        );
                        return {
                          emoji,
                          count: matching.length,
                          reacted: matching.some((reaction) =>
                            sameId(reaction.userId, user.id)
                          ),
                        };
                      }).filter((reaction) => reaction.count > 0);

                      return (
                        <article
                          key={message.id}
                          className={`llr-message-row ${own ? 'own' : ''}`}
                        >
                          <div className="llr-avatar">
                            {message.avatar ? (
                              <img src={message.avatar} alt="" />
                            ) : (
                              <span>
                                {String(
                                  message.displayName || 'E'
                                )
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            )}
                          </div>

                          <div className="llr-message-body">
                            <div className="llr-message-topline">
                              <strong>{own ? 'You' : message.displayName}</strong>
                              <time>{timeLabel(message.createdAt)}</time>
                              {message.isPinned && (
                                <span className="llr-pin-label">PINNED</span>
                              )}
                            </div>
                            <p>{message.content}</p>

                            <div className="echoo-message-footer">
                              {reactionGroups.length > 0 && (
                                <div
                                  className="echoo-reaction-summary"
                                  aria-label="Message reactions"
                                >
                                  {reactionGroups.map(
                                    ({ emoji, count, reacted }) => (
                                      <button
                                        type="button"
                                        key={emoji}
                                        className={
                                          reacted ? 'active-reaction' : ''
                                        }
                                        disabled={Boolean(actionId)}
                                        onClick={() => react(message, emoji)}
                                        title={
                                          reacted
                                            ? `Remove ${emoji} reaction`
                                            : `React ${emoji}`
                                        }
                                      >
                                        {emoji} <span>{count}</span>
                                      </button>
                                    )
                                  )}
                                </div>
                              )}

                              <div className="echoo-message-tools">
                                <button
                                  type="button"
                                  className="echoo-react-trigger"
                                  title="React to message"
                                  aria-label="React to message"
                                  onClick={() =>
                                    setReactionMessageId((current) =>
                                      sameId(current, message.id)
                                        ? ''
                                        : message.id
                                    )
                                  }
                                >
                                  <FaSmile />
                                  <span>+</span>
                                </button>

                                {sameId(reactionMessageId, message.id) && (
                                  <div
                                    className={`echoo-reaction-picker ${own ? 'align-right' : ''}`}
                                    role="dialog"
                                    aria-label="Choose a reaction"
                                  >
                                    {REACTION_EMOJIS.map((emoji) => (
                                      <button
                                        type="button"
                                        key={emoji}
                                        disabled={Boolean(actionId)}
                                        onClick={() => react(message, emoji)}
                                        aria-label={`React ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="llr-chat-footer">
                <form className="llr-composer" onSubmit={send}>
                  <div className="echoo-emoji-wrap">
                    <button
                      type="button"
                      className={`echoo-emoji-trigger ${emojiOpen ? 'active' : ''}`}
                      aria-label="Add emoji"
                      title="Add emoji"
                      onClick={() => setEmojiOpen((open) => !open)}
                    >
                      <FaSmile />
                    </button>
                    {emojiOpen && (
                      <div
                        className="echoo-emoji-picker"
                        role="dialog"
                        aria-label="Choose an emoji"
                      >
                        {CHAT_EMOJIS.map((emoji) => (
                          <button
                            type="button"
                            className="echoo-emoji-option"
                            key={emoji}
                            aria-label={`Add ${emoji}`}
                            onClick={() => appendEmoji(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    value={text}
                    maxLength={500}
                    placeholder={
                      isScheduled
                        ? 'Chat before the broadcast starts...'
                        : 'Type a message...'
                    }
                    onChange={(event) => setText(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="echoo-chat-send"
                    title="Send message"
                    aria-label="Send message"
                    disabled={!text.trim() || sending}
                  >
                    <FaPaperPlane />
                  </button>
                </form>

                <div className="llr-chat-rules">
                  <FaShieldAlt />
                  <div>
                    <strong>Welcome to the live chat!</strong>
                    <span>
                      Be respectful and kind to other listeners. Let's keep the
                      conversation uplifting.
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      {ended && (
        <div className="llr-ended-banner">
          This broadcast has ended. Explore more live broadcasts on Echoo.
        </div>
      )}
    </main>
  );
};

export default ListenerRealLiveRoom;
