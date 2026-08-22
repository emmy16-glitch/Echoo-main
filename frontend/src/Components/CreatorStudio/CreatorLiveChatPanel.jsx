import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaComments,
  FaBan,
  FaEllipsisH,
  FaPaperPlane,
  FaSmile,
  FaThumbtack,
  FaTrash,
} from 'react-icons/fa';

import batch4Service, { normalizeChatMessage } from '../../services/batch4Service';
import realtimeService from '../../services/realtimeService';
import { CHAT_EMOJIS, REACTION_EMOJIS } from '../../constants/liveChatEmoji';
import '../../styles/live-chat-interactions.css';

const sameId = (first, second) =>
  Boolean(first && second && String(first) === String(second));

const readCurrentUser = () => {
  try {
    const raw = JSON.parse(localStorage.getItem('user') || '{}');
    return {
      ...raw,
      id: raw.id || raw._id || raw.userId || null,
    };
  } catch {
    return { id: null };
  }
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const CreatorLiveChatPanel = ({ broadcastId, listenerCount = 0 }) => {
  const user = useMemo(() => readCurrentUser(), []);
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactionMessageId, setReactionMessageId] = useState('');
  const [menuMessageId, setMenuMessageId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionId, setActionId] = useState('');
  const [realtimeState, setRealtimeState] = useState('connecting');
  const [error, setError] = useState('');
  const chatEndRef = useRef(null);

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

  const loadChat = useCallback(async ({ silent = false } = {}) => {
    if (!broadcastId) return;
    if (!silent) setLoading(true);

    try {
      const [messageResult, pinnedResult] = await Promise.all([
        batch4Service.getMessages(broadcastId, { limit: 100 }),
        batch4Service.getPinned(broadcastId),
      ]);
      setMessages(Array.isArray(messageResult?.data) ? messageResult.data : []);
      setPinned(Array.isArray(pinnedResult?.data) ? pinnedResult.data : []);
      setError('');
    } catch (chatError) {
      if (!silent) setError(chatError?.message || 'Could not load Live Chat.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [broadcastId]);

  useEffect(() => {
    if (!broadcastId) return undefined;

    let active = true;
    let socket = null;
    let fallbackInterval = null;

    const startFallback = () => {
      if (fallbackInterval) return;
      fallbackInterval = window.setInterval(() => loadChat({ silent: true }), 15000);
    };

    const connect = async () => {
      await loadChat();
      if (!active) return;

      try {
        setRealtimeState('connecting');
        socket = await realtimeService.joinBroadcast(broadcastId);
        if (!active) return;
        setRealtimeState('connected');

        const onMessage = (payload) => mergeMessage(payload);
        const onDeleted = ({ messageId } = {}) => {
          setMessages((current) => current.filter((item) => !sameId(item.id, messageId)));
          setPinned((current) => current.filter((item) => !sameId(item.id, messageId)));
        };
        const onReaction = ({ messageId, reactions } = {}) => {
          if (!messageId || !Array.isArray(reactions)) return;
          setMessages((current) => current.map((item) =>
            sameId(item.id, messageId) ? { ...item, reactions } : item
          ));
        };
        const onPinned = () => loadChat({ silent: true });
        const onDisconnect = () => {
          if (!active) return;
          setRealtimeState('fallback');
          startFallback();
        };
        const onConnect = () => {
          if (!active) return;
          setRealtimeState('connected');
          if (fallbackInterval) {
            window.clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
          socket.emit('broadcast:join', { broadcastId });
          loadChat({ silent: true });
        };

        socket.on('chat:message', onMessage);
        socket.on('chat:messageDeleted', onDeleted);
        socket.on('chat:reaction', onReaction);
        socket.on('chat:messagePinned', onPinned);
        socket.on('disconnect', onDisconnect);
        socket.on('connect', onConnect);

        socket.__echooCreatorChatCleanup = () => {
          socket.off('chat:message', onMessage);
          socket.off('chat:messageDeleted', onDeleted);
          socket.off('chat:reaction', onReaction);
          socket.off('chat:messagePinned', onPinned);
          socket.off('disconnect', onDisconnect);
          socket.off('connect', onConnect);
        };
      } catch (realtimeError) {
        if (!active) return;
        console.warn('Creator live chat realtime fallback:', realtimeError);
        setRealtimeState('fallback');
        startFallback();
      }
    };

    connect();

    return () => {
      active = false;
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      socket?.__echooCreatorChatCleanup?.();
      realtimeService.leaveBroadcast(broadcastId).catch(() => {});
    };
  }, [broadcastId, loadChat, mergeMessage]);

  useEffect(() => {
    if (loading) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, loading]);

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
    if (!content || sending || !broadcastId) return;

    try {
      setSending(true);
      setError('');
      const response = await batch4Service.sendMessage(broadcastId, content);
      if (response?.data) mergeMessage(response.data);
      setText('');
      setEmojiOpen(false);
    } catch (sendError) {
      setError(sendError?.message || 'Could not send the chat message.');
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

  const pin = async (message) => {
    if (!message?.id || actionId) return;
    try {
      setActionId(`pin:${message.id}`);
      await batch4Service.pin(message.id);
      setMenuMessageId('');
      await loadChat({ silent: true });
    } catch (pinError) {
      setError(pinError?.message || 'Could not update the pinned message.');
    } finally {
      setActionId('');
    }
  };

  const remove = async (message) => {
    if (!message?.id || actionId) return;
    try {
      setActionId(`delete:${message.id}`);
      await batch4Service.deleteMessage(message.id);
      setMessages((current) => current.filter((item) => !sameId(item.id, message.id)));
      setPinned((current) => current.filter((item) => !sameId(item.id, message.id)));
      setMenuMessageId('');
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not remove the message.');
    } finally {
      setActionId('');
    }
  };

  const muteUser = async (message) => {
    if (!message?.userId || actionId) return;
    try {
      setActionId(`mute:${message.id}`);
      await batch4Service.muteUser(broadcastId, message.userId);
      setMenuMessageId('');
      setError('');
    } catch (muteError) {
      setError(muteError?.message || 'Could not update this listener.');
    } finally {
      setActionId('');
    }
  };

  return (
    <section className="ebsx-chat-card echoo-premium-live-chat">
      <div className="ebsx-card-head echoo-live-chat-head">
        <div>
          <FaComments />
          <div>
            <h2>Live Chat</h2>
            <small>{Number(listenerCount).toLocaleString()} online</small>
          </div>
        </div>
        <div className={`ebsx-chat-realtime ${realtimeState === 'connected' ? 'connected' : ''}`}>
          <i /> {realtimeState === 'connected' ? 'Realtime' : 'Reconnecting'}
        </div>
      </div>

      {error && <div className="ebsx-message error">{error}</div>}

      {pinned.length > 0 && (
        <div className="ebsx-chat-pinned">
          <FaThumbtack />
          <span><strong>{pinned[0].displayName}</strong> {pinned[0].content}</span>
        </div>
      )}

      <div className="ebsx-chat-list echoo-premium-chat-list">
        {loading ? (
          <div className="ebsx-chat-empty"><FaComments /> Loading chat...</div>
        ) : messages.length ? (
          messages.slice(-30).map((chat) => {
            const own = sameId(chat.userId, user.id);
            const reactionGroups = REACTION_EMOJIS.map((emoji) => {
              const matching = (chat.reactions || []).filter((reaction) => reaction.emoji === emoji);
              return {
                emoji,
                count: matching.length,
                reacted: matching.some((reaction) => sameId(reaction.userId, user.id)),
              };
            }).filter((reaction) => reaction.count > 0);

            return (
              <div className={`ebsx-chat-row ${own ? 'own' : ''}`} key={chat.id || chat._id}>
                <div className="ebsx-chat-avatar">
                  {chat.avatar ? <img src={chat.avatar} alt="" /> : String(chat.displayName || 'E').charAt(0)}
                </div>
                <div className="ebsx-chat-body">
                  <div className="ebsx-chat-meta">
                    <strong>{own ? 'You' : (chat.displayName || chat.username || 'Listener')}</strong>
                    <small>{formatTime(chat.createdAt)}</small>
                    {chat.isPinned && <em className="ebsx-chat-pin-label">PINNED</em>}
                  </div>
                  <p>{chat.content}</p>

                  <div className="echoo-message-footer">
                    {reactionGroups.length > 0 && (
                      <div className="echoo-reaction-summary" aria-label="Message reactions">
                        {reactionGroups.map(({ emoji, count, reacted }) => (
                          <button
                            type="button"
                            key={emoji}
                            className={reacted ? 'active-reaction' : ''}
                            disabled={Boolean(actionId)}
                            onClick={() => react(chat, emoji)}
                            title={reacted ? `Remove ${emoji} reaction` : `React ${emoji}`}
                          >
                            {emoji} <span>{count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="echoo-message-tools">
                      <button
                        type="button"
                        className="echoo-react-trigger"
                        title="React to message"
                        aria-label="React to message"
                        onClick={() => setReactionMessageId((current) =>
                          sameId(current, chat.id) ? '' : chat.id
                        )}
                      >
                        <FaSmile /><span>+</span>
                      </button>
                      <button
                        type="button"
                        className="echoo-message-menu-trigger"
                        title="Message actions"
                        aria-label="Message actions"
                        onClick={() => setMenuMessageId((current) =>
                          sameId(current, chat.id) ? '' : chat.id
                        )}
                      >
                        <FaEllipsisH />
                      </button>

                      {sameId(reactionMessageId, chat.id) && (
                        <div className={`echoo-reaction-picker ${own ? 'align-right' : ''}`} role="dialog" aria-label="Choose a reaction">
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              type="button"
                              key={emoji}
                              disabled={Boolean(actionId)}
                              onClick={() => react(chat, emoji)}
                              aria-label={`React ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {sameId(menuMessageId, chat.id) && (
                        <div className={`echoo-message-menu ${own ? 'align-right' : ''}`} role="menu">
                          <button type="button" disabled={Boolean(actionId)} onClick={() => pin(chat)}>
                            <FaThumbtack /> {chat.isPinned ? 'Unpin message' : 'Pin message'}
                          </button>
                          <button type="button" className="danger" disabled={Boolean(actionId)} onClick={() => remove(chat)}>
                            <FaTrash /> Remove message
                          </button>
                          {!own && <button type="button" disabled={Boolean(actionId)} onClick={() => muteUser(chat)}><FaBan /> Mute listener</button>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="ebsx-chat-empty"><FaComments /> No chat messages yet.</div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="echoo-chat-live-divider"><span><i /> Live</span></div>

      <form className="ebsx-chat-form" onSubmit={send}>
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
            <div className="echoo-emoji-picker" role="dialog" aria-label="Choose an emoji">
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
          onChange={(event) => setText(event.target.value)}
          placeholder="Type a message..."
        />
        <button
          type="submit"
          className="echoo-chat-send"
          title="Send message"
          aria-label="Send message"
          disabled={sending || !text.trim()}
        >
          <FaPaperPlane />
        </button>
      </form>
    </section>
  );
};

export default CreatorLiveChatPanel;
