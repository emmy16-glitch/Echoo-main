import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  FaExpand,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';
import { FiArrowLeft, FiCheck, FiRadio, FiShare2, FiUsers } from 'react-icons/fi';

import batch3Service from '../../services/batch3Service';
import batch4Service, { normalizeChatMessage } from '../../services/batch4Service';
import followService from '../../services/followService';
import realtimeService from '../../services/realtimeService';
import { buildMediaUrl } from '../../services/api';
import { notifyDesktop, onDesktopRoomCommand, setDesktopRoomState } from '../../services/desktopBridge';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding';
import { ChatPanel } from '../../design-system';
import { referenceChat, referenceLiveShows } from '../ListenerExperience/listenerExperienceData';
import LiveKitListenerPlayer from './LiveKitListenerPlayer';
import './ListenerLiveRoom.css';
import './ListenerV2LiveRoom.css';

const sameId = (first, second) => Boolean(first && second && String(first) === String(second));

const normalizeBroadcast = (item) => ({
  ...item,
  id: item?.id || item?._id || item?.broadcastId,
  title: item?.title || item?.stationName || item?.station?.name || 'Live on Echoo',
  category: item?.category || item?.station?.category || 'Live',
  creator:
    item?.creatorName ||
    item?.creator?.displayName ||
    (typeof item?.creator === 'string' ? item.creator : '') ||
    item?.station?.owner?.displayName ||
    'Echoo Creator',
  handle:
    item?.handle ||
    (item?.creatorHandle || item?.creator?.username
      ? `@${item?.creator?.username || item?.creatorHandle}`
      : ''),
  verified: Boolean(
    item?.verified ??
      item?.creatorVerified ??
      item?.station?.owner?.creatorProfile?.isVerified
  ),
  listenerCount: Number(item?.listenerCount ?? item?.station?.listenerCount) || 0,
  artwork:
    buildMediaUrl(
      item?.artwork ||
        item?.coverArt ||
        item?.station?.brandCover ||
        item?.station?.coverArt
    ) ||
    buildGeneratedStationBrandCoverUrl(
      item?.station || {
        name: item?.title || item?.stationName,
        category: item?.category,
      }
    ),
  description: item?.description || 'Join the conversation and listen live on Echoo.',
  stationId: item?.stationId || item?.station?.id || item?.station?._id || null,
  status: String(item?.status || 'live').toLowerCase(),
  replayAudioId:
    item?.replayAudio?.id ||
    item?.replayAudio?._id ||
    item?.replayAudio ||
    null,
});

const chatView = (message) => ({
  ...message,
  id: message.id,
  name:
    message.displayName ||
    message.username ||
    message.user?.displayName ||
    'Echoo Listener',
  text: message.content || '',
  time: message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Now',
  reaction:
    Array.isArray(message.reactions) && message.reactions.length
      ? message.reactions.length
      : '',
});

const mergeById = (items, incoming) => {
  if (!incoming?.id) return items;
  const index = items.findIndex((item) => sameId(item.id, incoming.id));
  if (index < 0) return [...items, incoming];
  const next = [...items];
  next[index] = { ...next[index], ...incoming };
  return next;
};

const ListenerRealLiveRoom = () => {
  const { broadcastId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { setLivePlayerState = () => {} } = useOutletContext() || {};
  const stageRef = useRef(null);

  const previewMode =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get('preview') === 'reference';
  const initialShow =
    location.state?.show ||
    (previewMode
      ? referenceLiveShows.find((item) => item.id === broadcastId) ||
        referenceLiveShows[0]
      : null);

  const [show, setShow] = useState(
    initialShow ? normalizeBroadcast(initialShow) : null
  );
  const [messages, setMessages] = useState(previewMode ? referenceChat : []);
  const [loading, setLoading] = useState(!initialShow);
  const [chatLoading, setChatLoading] = useState(!previewMode);
  const [loadError, setLoadError] = useState('');
  const [chatError, setChatError] = useState('');
  const [joined, setJoined] = useState(true);
  const [following, setFollowing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [realtimeState, setRealtimeState] = useState('connecting');
  const [audioState, setAudioState] = useState('connecting');
  const statusRef = useRef(show?.status || '');
  const [liveState, setLiveState] = useState(null);

  const ended = show
    ? !['live', 'scheduled'].includes(String(show.status || '').toLowerCase())
    : false;
  const isLive = show?.status === 'live';

  useEffect(() => {
    statusRef.current = show?.status || '';
  }, [show?.status]);

  const handleLivePlayerState = useCallback(
    (state) => {
      setLiveState(state);
      if (state?.status) setAudioState(state.status);
      setLivePlayerState(state);
    },
    [setLivePlayerState]
  );

  useEffect(() => {
    const active = Boolean(isLive && joined);
    setDesktopRoomState({
      active,
      muted: Boolean(liveState?.isMuted),
      canToggleMute: typeof liveState?.onToggleMute === 'function',
    });

    return () => {
      setDesktopRoomState({ active: false, muted: false, canToggleMute: false });
    };
  }, [isLive, joined, liveState?.isMuted, liveState?.onToggleMute]);

  useEffect(
    () =>
      onDesktopRoomCommand((command) => {
        if (command === 'toggle-mute') liveState?.onToggleMute?.();
        if (command === 'leave-room') {
          setJoined(false);
          navigate('/listen/live');
        }
      }),
    [liveState?.onToggleMute, navigate]
  );

  const playerTrack = useMemo(
    () =>
      show
        ? {
            id: show.id,
            title: show.title,
            subtitle: show.creator,
            coverArt: show.artwork,
            isLive: true,
          }
        : null,
    [show]
  );

  const refreshPresence = useCallback(async () => {
    if (previewMode || !broadcastId) return;
    try {
      const presence = await batch3Service.getPresence(broadcastId);
      setShow((current) =>
        current
          ? {
              ...current,
              status: presence.status || current.status,
              listenerCount: Number(presence.listenerCount) || 0,
              mediaState: presence.mediaState || current.mediaState,
            }
          : current
      );
    } catch {
      // Presence metadata must not interrupt a healthy LiveKit audio session.
    }
  }, [broadcastId, previewMode]);

  const loadChat = useCallback(
    async ({ silent = false } = {}) => {
      if (previewMode || !broadcastId) return;
      if (!silent) setChatLoading(true);
      try {
        const response = await batch4Service.getMessages(broadcastId, { limit: 100 });
        setMessages(
          Array.isArray(response?.data) ? response.data.map(chatView) : []
        );
        setChatError('');
      } catch (error) {
        if (!silent) {
          setChatError(error?.message || 'Live chat is unavailable.');
        }
      } finally {
        if (!silent) setChatLoading(false);
      }
    },
    [broadcastId, previewMode]
  );

  const load = useCallback(async () => {
    if (!broadcastId || previewMode) return;
    try {
      setLoading(true);
      const response = await batch3Service.getBroadcast(broadcastId);
      if (!response?.data) {
        throw new Error('This live show could not be found.');
      }
      const next = normalizeBroadcast(response.data);
      setShow(next);
      setLoadError('');
      await Promise.all([loadChat(), refreshPresence()]);
      if (next.stationId) {
        followService
          .getStationStatus(next.stationId)
          .then((status) => setFollowing(Boolean(status?.isFollowing)))
          .catch(() => {});
      }
    } catch (error) {
      setLoadError(error?.message || 'This live show is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [broadcastId, loadChat, previewMode, refreshPresence]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (
      previewMode ||
      !show?.id ||
      ['completed', 'cancelled', 'failed'].includes(statusRef.current)
    ) {
      return undefined;
    }

    let active = true;
    let socket = null;
    let fallbackTimer = null;

    const fallback = () => {
      if (fallbackTimer) return;
      fallbackTimer = window.setInterval(() => {
        loadChat({ silent: true });
        refreshPresence();
      }, 15000);
    };

    realtimeService
      .joinBroadcast(show.id)
      .then((connectedSocket) => {
        if (!active) return;
        socket = connectedSocket;
        setRealtimeState('connected');

        const onMessage = (payload) => {
          const normalized = normalizeChatMessage(payload);
          if (normalized) {
            setMessages((current) => mergeById(current, chatView(normalized)));
            notifyDesktop('message');
          }
        };
        const onDeleted = ({ messageId } = {}) =>
          setMessages((current) =>
            current.filter((item) => !sameId(item.id, messageId))
          );
        const onReaction = ({ messageId, reactions } = {}) =>
          setMessages((current) =>
            current.map((item) =>
              sameId(item.id, messageId)
                ? {
                    ...item,
                    reactions,
                    reaction: reactions?.length || '',
                  }
                : item
            )
          );
        const onStatus = (payload) => {
          if (!sameId(payload?.broadcastId, show.id)) return;
          const nextStatus = String(payload?.status || '').toLowerCase();
          const previousStatus = String(statusRef.current || '').toLowerCase();
          if (nextStatus !== previousStatus && nextStatus === 'live') {
            notifyDesktop('room-started');
          }
          if (
            nextStatus !== previousStatus &&
            ['completed', 'cancelled', 'failed'].includes(nextStatus)
          ) {
            notifyDesktop('room-ended');
          }
          setShow((current) =>
            current ? normalizeBroadcast({ ...current, ...payload }) : current
          );
        };
        const onDisconnect = () => {
          setRealtimeState('fallback');
          fallback();
        };
        const onConnect = () => {
          setRealtimeState('connected');
          if (fallbackTimer) window.clearInterval(fallbackTimer);
          fallbackTimer = null;
          connectedSocket.emit('broadcast:join', { broadcastId: show.id });
        };

        connectedSocket.on('chat:message', onMessage);
        connectedSocket.on('chat:messageDeleted', onDeleted);
        connectedSocket.on('chat:reaction', onReaction);
        connectedSocket.on('broadcast:status', onStatus);
        connectedSocket.on('presence:changed', refreshPresence);
        connectedSocket.on('disconnect', onDisconnect);
        connectedSocket.on('connect', onConnect);
        onStatus(
          connectedSocket.__echooBroadcastSnapshots?.get(String(show.id))
        );

        socket.__echooRoomCleanup = () => {
          connectedSocket.off('chat:message', onMessage);
          connectedSocket.off('chat:messageDeleted', onDeleted);
          connectedSocket.off('chat:reaction', onReaction);
          connectedSocket.off('broadcast:status', onStatus);
          connectedSocket.off('presence:changed', refreshPresence);
          connectedSocket.off('disconnect', onDisconnect);
          connectedSocket.off('connect', onConnect);
        };
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Echoo realtime fallback:', error?.message || error);
        setRealtimeState('fallback');
        fallback();
      });

    return () => {
      active = false;
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      socket?.__echooRoomCleanup?.();
      realtimeService.leaveBroadcast(show.id).catch(() => {});
    };
  }, [loadChat, previewMode, refreshPresence, show?.id]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: show?.title || 'Live on Echoo', url });
        setShareMessage('Shared');
      } else {
        await navigator.clipboard?.writeText(url);
        setShareMessage('Live link copied');
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setShareMessage('Could not share this live link');
    }
    window.setTimeout(() => setShareMessage(''), 1800);
  };

  const toggleFollow = async () => {
    if (previewMode || !show?.stationId) {
      setFollowing((value) => !value);
      return;
    }

    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      if (wasFollowing) await followService.unfollowStation(show.stationId);
      else await followService.followStation(show.stationId);
    } catch (error) {
      setFollowing(wasFollowing);
      setLoadError(error?.message || 'Could not update your follow status.');
    }
  };

  const sendMessage = async (content) => {
    if (previewMode) {
      setMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}`,
          name: 'You',
          time: 'Now',
          text: content,
          reaction: '',
        },
      ]);
      return true;
    }

    try {
      const response = await batch4Service.sendMessage(broadcastId, content);
      if (response?.data) {
        setMessages((current) =>
          mergeById(current, chatView(response.data))
        );
      }
      setChatError('');
      return true;
    } catch (error) {
      setChatError(error?.message || 'Could not send your message.');
      return false;
    }
  };

  const react = async (message, emoji) => {
    if (previewMode || !message?.id) return;
    try {
      const response = await batch4Service.react(message.id, emoji);
      const reactions = response?.data?.reactions || [];
      setMessages((current) =>
        current.map((item) =>
          sameId(item.id, message.id)
            ? {
                ...item,
                reactions,
                reaction: reactions.length || '',
              }
            : item
        )
      );
    } catch (error) {
      setChatError(error?.message || 'Could not update that reaction.');
    }
  };

  const audioStatusLabel = !isLive
    ? 'Audio disconnected'
    : show.mediaState === 'audio_paused'
      ? 'Broadcast paused'
      : audioState === 'listening'
        ? 'Audio live'
        : audioState === 'connecting' || show.mediaState === 'creator_connecting'
          ? 'Creator connecting'
          : audioState === 'connected' || show.mediaState === 'waiting_for_creator'
            ? 'Waiting for creator'
            : 'Audio disconnected';

  const togglePlayback = () => {
    if (!isLive) return;
    if (!joined) {
      setJoined(true);
      return;
    }
    liveState?.onTogglePlay?.();
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stageRef.current?.requestFullscreen?.();
      }
    } catch {
      // Fullscreen support varies by browser; playback remains usable without it.
    }
  };

  if (loading) {
    return (
      <main className="listener-v2-live-room listener-v2-live-room--state">
        <div>Preparing the live room…</div>
      </main>
    );
  }

  if (!show) {
    return (
      <main className="listener-v2-live-room listener-v2-live-room--state">
        <button type="button" onClick={() => navigate('/listen/live')}>
          <FiArrowLeft /> Back to Live Now
        </button>
        <div>{loadError || 'This live show is unavailable.'}</div>
      </main>
    );
  }

  return (
    <main className="listener-v2-live-room">
      <header className="listener-v2-room-toolbar">
        <button
          type="button"
          className="listener-v2-room-back"
          onClick={() => navigate('/listen/live')}
          aria-label="Back to Live Now"
        >
          <FiArrowLeft />
        </button>

        <div className="listener-v2-room-identity">
          <span className="listener-v2-room-avatar">
            {String(show.creator || 'E').charAt(0).toUpperCase()}
          </span>
          <span className="listener-v2-room-identity-copy">
            <strong>
              {show.creator}
              {show.verified && <FiCheck aria-label="Verified" />}
            </strong>
            <small>{show.handle || show.category}</small>
          </span>
        </div>

        <div className="listener-v2-room-toolbar-actions">
          <span className="listener-v2-room-listeners">
            <FiUsers /> {show.listenerCount.toLocaleString()} listening
          </span>
          <button
            type="button"
            className={following ? 'is-following' : ''}
            onClick={toggleFollow}
          >
            {following ? 'Following' : 'Follow'}
          </button>
          <button type="button" onClick={share}>
            <FiShare2 /> Share
          </button>
        </div>
      </header>

      {(shareMessage || loadError) && (
        <div className="listener-v2-room-notice" role="status">
          {shareMessage || loadError}
        </div>
      )}

      <section className="listener-v2-room-grid">
        <article className="listener-v2-room-stage" ref={stageRef}>
          <div className="listener-v2-room-artwork">
            {show.artwork ? (
              <img src={show.artwork} alt="" />
            ) : (
              <div className="listener-v2-room-artwork-fallback">
                <FaHeadphones />
              </div>
            )}
            <span
              className={`listener-v2-room-live-badge${
                isLive ? '' : ' is-ended'
              }`}
            >
              <FiRadio /> {isLive ? 'LIVE' : ended ? 'ENDED' : 'SCHEDULED'}
            </span>
          </div>

          <div className="listener-v2-room-event-copy">
            <div>
              <h1>{show.title}</h1>
              <p>{show.description || 'Live audio on Echoo.'}</p>
            </div>
            <div className="listener-v2-room-event-meta">
              <span className="listener-v2-room-live-text">
                <i /> {isLive ? 'LIVE' : show.status.toUpperCase()}
              </span>
              <span><FiUsers /> {show.listenerCount.toLocaleString()} listening</span>
            </div>
          </div>

          <div className="listener-v2-livekit-host">
            {!previewMode && (
              <LiveKitListenerPlayer
                broadcastId={show.id}
                isLive={isLive && joined}
                track={playerTrack}
                onStateChange={handleLivePlayerState}
              />
            )}
          </div>

          <div className="listener-v2-room-controls">
            <button
              type="button"
              onClick={liveState?.onToggleMute}
              aria-label={liveState?.isMuted ? 'Unmute' : 'Mute'}
              disabled={!isLive}
            >
              {liveState?.isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>

            <div className="listener-v2-room-control-center">
              <button
                type="button"
                className="listener-v2-room-play"
                aria-label={liveState?.isPlaying ? 'Pause' : 'Play'}
                disabled={!isLive || Boolean(liveState?.playerError)}
                onClick={togglePlayback}
              >
                {liveState?.isPlaying ? <FaPause /> : <FaPlay />}
              </button>
              <span>{audioStatusLabel}</span>
            </div>

            <div className="listener-v2-room-live-line" aria-hidden="true">
              <span />
            </div>

            <span className="listener-v2-room-realtime-state">
              {isLive ? `Room ${realtimeState}` : 'Broadcast ended'}
            </span>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Fullscreen player"
            >
              <FaExpand />
            </button>
          </div>

          {!isLive &&
            show.replayAudioId &&
            show?.assetVisibility?.audio !== 'private' && (
              <button
                type="button"
                className="listener-v2-room-replay"
                onClick={() => navigate(`/listen/audio/${show.replayAudioId}`)}
              >
                Open replay
              </button>
            )}
        </article>

        <aside className="listener-v2-room-chat">
          <ChatPanel
            messages={messages}
            loading={chatLoading}
            disabled={!isLive}
            error={chatError}
            onSend={sendMessage}
            onReact={react}
          />
        </aside>
      </section>
    </main>
  );
};

export default ListenerRealLiveRoom;
