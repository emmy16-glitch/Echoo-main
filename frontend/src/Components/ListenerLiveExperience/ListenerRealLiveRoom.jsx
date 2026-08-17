import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBroadcastTower,
  FaComments,
  FaHeadphones,
  FaPaperPlane,
  FaSyncAlt,
  FaThumbtack,
  FaTrash,
  FaUsers,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import batch4Service, {
  normalizeChatMessage,
} from '../../services/batch4Service';
import realtimeService from '../../services/realtimeService';
import LiveKitListenerPlayer from './LiveKitListenerPlayer';
import './ListenerLiveRoom.css';

const REACTIONS = ['👍', '❤️', '🔥', '👏'];

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

const dateLabel = (value) => {
  if (!value) return 'Time not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time not set';
  return date.toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ListenerRealLiveRoom = () => {
  const { broadcastId } = useParams();
  const navigate = useNavigate();
  const user = useMemo(currentUser, []);

  const [broadcast, setBroadcast] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [presence, setPresence] = useState({
    listenerCount: 0,
    peakListeners: 0,
    creatorConnected: false,
  });
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionId, setActionId] = useState('');
  const [realtimeState, setRealtimeState] = useState('connecting');
  const [error, setError] = useState('');
  const chatEndRef = useRef(null);

  const isLive = broadcast?.status === 'live';
  const isScheduled = broadcast?.status === 'scheduled';
  const chatAvailable = isLive || isScheduled;
  const creatorId = broadcast?.creatorId || null;
  const isCreator = sameId(user.id, creatorId);

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
  }, [loadBroadcast, loadChat, refreshPresence]);

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
        const onReaction = () => loadChat({ silent: true });
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
      await batch4Service.react(message.id, emoji);
      if (realtimeState !== 'connected') await loadChat({ silent: true });
    } catch (reactionError) {
      setError(reactionError?.message || 'Could not update the reaction.');
    } finally {
      setActionId('');
    }
  };

  const pin = async (message) => {
    if (!message?.id || actionId || !isCreator) return;
    try {
      setActionId(`pin:${message.id}`);
      await batch4Service.pin(message.id);
      await loadChat({ silent: true });
    } catch (pinError) {
      setError(pinError?.message || 'Could not update the pinned message.');
    } finally {
      setActionId('');
    }
  };

  const remove = async (message) => {
    if (!message?.id || actionId) return;
    const own = sameId(message.userId, user.id);
    if (!own && !isCreator) return;

    try {
      setActionId(`delete:${message.id}`);
      await batch4Service.deleteMessage(message.id);
      setMessages((current) =>
        current.filter((item) => !sameId(item.id, message.id))
      );
      setPinned((current) =>
        current.filter((item) => !sameId(item.id, message.id))
      );
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not remove the message.');
    } finally {
      setActionId('');
    }
  };

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
        <button type="button" className="llr-back" onClick={() => navigate('/listen/live')}>
          <FaArrowLeft /> Live
        </button>
        <div className="llr-state">
          <strong>Broadcast unavailable</strong>
          <span>{error || 'This broadcast could not be loaded.'}</span>
        </div>
      </main>
    );
  }

  const ended = ['completed', 'cancelled', 'failed'].includes(broadcast.status);

  return (
    <main className="llr-page">
      <button type="button" className="llr-back" onClick={() => navigate('/listen/live')}>
        <FaArrowLeft /> Live
      </button>

      {error && <div className="llr-message error">{error}</div>}

      <section className="llr-hero">
        <div className="llr-art">
          {broadcast.coverArt ? (
            <img src={broadcast.coverArt} alt="" />
          ) : (
            <FaHeadphones />
          )}
          <span className={`llr-status ${broadcast.status}`}>{broadcast.status}</span>
        </div>

        <div className="llr-hero-copy">
          <span className="llr-kicker">{broadcast.stationName}</span>
          <h1>{broadcast.title}</h1>
          <p>{broadcast.description || 'Live audio on Echoo.'}</p>

          <div className="llr-meta">
            <span><FaUsers /> {presence.listenerCount || broadcast.listenerCount || 0} listening</span>
            <span><FaBroadcastTower /> {broadcast.creatorName}</span>
            <span>
              <i className={`llr-realtime-dot ${realtimeState}`} />
              {realtimeState === 'connected'
                ? 'Chat realtime'
                : realtimeState === 'fallback'
                  ? 'Chat reconnecting'
                  : 'Connecting chat'}
            </span>
          </div>

          {isScheduled && (
            <div className="llr-scheduled">
              Starts {dateLabel(broadcast.startTime)}. Audio will connect when the creator goes live.
            </div>
          )}

          {ended && (
            <div className="llr-ended">This broadcast has ended.</div>
          )}

          {isLive && (
            <LiveKitListenerPlayer
              broadcastId={broadcast.id}
              isLive={isLive}
            />
          )}
        </div>
      </section>

      <section className="llr-chat-shell">
        <header className="llr-chat-header">
          <div>
            <FaComments />
            <div>
              <strong>Live Chat</strong>
              <span>{chatAvailable ? 'Real Echoo messages' : 'Chat closed'}</span>
            </div>
          </div>
          <button
            type="button"
            className="llr-refresh"
            onClick={() => loadChat()}
            disabled={!chatAvailable || chatLoading}
          >
            <FaSyncAlt /> Refresh
          </button>
        </header>

        {pinned.length > 0 && (
          <div className="llr-pinned">
            <FaThumbtack />
            <div>
              <span>Pinned</span>
              <strong>{pinned[0].displayName}: {pinned[0].content}</strong>
            </div>
          </div>
        )}

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
            messages.map((message) => {
              const own = sameId(message.userId, user.id);
              const canDelete = own || isCreator;

              return (
                <article key={message.id} className={`llr-message-row ${own ? 'own' : ''}`}>
                  <div className="llr-avatar">
                    {message.avatar ? (
                      <img src={message.avatar} alt="" />
                    ) : (
                      <span>{String(message.displayName || 'E').charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="llr-message-body">
                    <div className="llr-message-topline">
                      <strong>{message.displayName}</strong>
                      <time>{timeLabel(message.createdAt)}</time>
                      {message.isPinned && <span className="llr-pin-label">PINNED</span>}
                    </div>
                    <p>{message.content}</p>

                    <div className="llr-message-actions">
                      {REACTIONS.map((emoji) => {
                        const count = message.reactions.filter(
                          (reaction) => reaction.emoji === emoji
                        ).length;
                        return (
                          <button
                            type="button"
                            key={emoji}
                            disabled={Boolean(actionId)}
                            onClick={() => react(message, emoji)}
                          >
                            {emoji}{count > 0 ? ` ${count}` : ''}
                          </button>
                        );
                      })}

                      {isCreator && (
                        <button type="button" onClick={() => pin(message)} disabled={Boolean(actionId)}>
                          <FaThumbtack /> {message.isPinned ? 'Unpin' : 'Pin'}
                        </button>
                      )}

                      {canDelete && (
                        <button type="button" onClick={() => remove(message)} disabled={Boolean(actionId)}>
                          <FaTrash /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {chatAvailable ? (
          <form className="llr-composer" onSubmit={send}>
            <input
              value={text}
              maxLength={500}
              placeholder={isScheduled ? 'Chat before the broadcast starts...' : 'Type a message...'}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" disabled={!text.trim() || sending}>
              <FaPaperPlane /> {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        ) : (
          <div className="llr-chat-closed">Chat is closed for this broadcast.</div>
        )}
      </section>
    </main>
  );
};

export default ListenerRealLiveRoom;
