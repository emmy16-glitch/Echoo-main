import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  FaBell,
  FaComments,
  FaExpand,
  FaHeart,
  FaPaperPlane,
  FaTv,
  FaShieldAlt,
  FaShare,
  FaSmile,
  FaTimes,
  FaUsers,
  FaCalendar,
  FaEllipsisH,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaVolumeUp,
  FaVolumeMute,
} from 'react-icons/fa';
import { FiArrowLeft, FiRadio, FiUsers } from 'react-icons/fi';

import batch3Service from '../../services/batch3Service';
import batch4Service, { normalizeChatMessage } from '../../services/batch4Service';
import followService from '../../services/followService';
import realtimeService from '../../services/realtimeService';
import { buildMediaUrl } from '../../services/api';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding';
import { ChatPanel, LiveRoomHeader, Waveform } from '../../design-system';
import { referenceChat, referenceLiveShows } from '../ListenerExperience/listenerExperienceData';
import LiveKitListenerPlayer from './LiveKitListenerPlayer';
import './ListenerLiveRoom.css';

const sameId = (first, second) => Boolean(first && second && String(first) === String(second));

const normalizeBroadcast = (item) => ({
  ...item,
  id: item?.id || item?._id || item?.broadcastId,
  title: item?.title || item?.stationName || item?.station?.name || 'Live on Echoo',
  category: item?.category || item?.station?.category || 'Live',
  creator: item?.creatorName || item?.creator?.displayName || (typeof item?.creator === 'string' ? item.creator : '') || item?.station?.owner?.displayName || 'Echoo Creator',
  handle: item?.handle || (item?.creatorHandle || item?.creator?.username ? `@${item?.creator?.username || item?.creatorHandle}` : ''),
  verified: Boolean(item?.verified ?? item?.creatorVerified ?? item?.station?.owner?.creatorProfile?.isVerified),
  listenerCount: Number(item?.listenerCount ?? item?.station?.listenerCount) || 0,
  artwork: buildMediaUrl(item?.artwork || item?.coverArt || item?.station?.brandCover || item?.station?.coverArt) || buildGeneratedStationBrandCoverUrl(item?.station || { name: item?.title || item?.stationName, category: item?.category }),
  description: item?.description || 'Join the conversation and listen live on Echoo.',
  stationId: item?.stationId || item?.station?.id || item?.station?._id || null,
  status: String(item?.status || 'live').toLowerCase(),
  replayAudioId: item?.replayAudio?.id || item?.replayAudio?._id || item?.replayAudio || null,
});

const chatView = (message) => ({
  ...message,
  id: message.id,
  name: message.displayName || message.username || message.user?.displayName || 'Echoo Listener',
  text: message.content || '',
  time: message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Now',
  reaction: Array.isArray(message.reactions) && message.reactions.length
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
  const previewMode = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'reference';
  const initialShow = location.state?.show || (previewMode ? referenceLiveShows.find((item) => item.id === broadcastId) || referenceLiveShows[0] : null);
  
  const [show, setShow] = useState(initialShow ? normalizeBroadcast(initialShow) : null);
  const [messages, setMessages] = useState(previewMode ? referenceChat : []);
  const [loading, setLoading] = useState(!initialShow);
  const [chatLoading, setChatLoading] = useState(!previewMode);
  const [loadError, setLoadError] = useState('');
  const [chatError, setChatError] = useState('');
  const [joined, setJoined] = useState(true);
  const [following, setFollowing] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [realtimeState, setRealtimeState] = useState(previewMode ? 'connecting' : 'connecting');
  const [audioState, setAudioState] = useState(previewMode ? 'connecting' : 'connecting');
  const statusRef = useRef(show?.status || '');
  
  const [liveState, setLiveState] = useState(null);
  const handleLivePlayerState = useCallback((state) => {
    setLiveState(state);
    if (state?.status) setAudioState(state.status);
    setLivePlayerState(state);
  }, [setLivePlayerState]);

  const ended = show
    ? !['live', 'scheduled'].includes(String(show.status || '').toLowerCase())
    : false;

  useEffect(() => {
    statusRef.current = show?.status || '';
  }, [show?.status]);

  const isLive = show?.status === 'live';
  const playerTrack = useMemo(() => show ? ({
    id: show.id,
    title: show.title,
    subtitle: show.creator,
    coverArt: show.artwork,
    isLive: true,
  }) : null, [show]);

  const refreshPresence = useCallback(async () => {
    if (previewMode || !broadcastId) return;
    try {
      const presence = await batch3Service.getPresence(broadcastId);
      setShow((current) => current ? ({
        ...current,
        status: presence.status || current.status,
        listenerCount: Number(presence.listenerCount) || 0,
        mediaState: presence.mediaState || current.mediaState,
      }) : current);
    } catch {
      // Presence metadata must not interrupt a healthy LiveKit audio session.
    }
  }, [broadcastId, previewMode]);

  const loadChat = useCallback(async ({ silent = false } = {}) => {
    if (previewMode || !broadcastId) return;
    if (!silent) setChatLoading(true);
    try {
      const response = await batch4Service.getMessages(broadcastId, { limit: 100 });
      setMessages(Array.isArray(response?.data) ? response.data.map(chatView) : []);
      setChatError('');
    } catch (error) {
      if (!silent) setChatError(error?.message || 'Live chat is unavailable.');
    } finally {
      if (!silent) setChatLoading(false);
    }
  }, [broadcastId, previewMode]);

  const load = useCallback(async () => {
    if (!broadcastId || previewMode) return;
    try {
      setLoading(true);
      const response = await batch3Service.getBroadcast(broadcastId);
      if (!response?.data) throw new Error('This live show could not be found.');
      const next = normalizeBroadcast(response.data);
      setShow(next);
      setLoadError('');
      await Promise.all([loadChat(), refreshPresence()]);
      if (next.stationId) {
        followService.getStationStatus(next.stationId)
          .then((status) => setFollowing(Boolean(status?.isFollowing)))
          .catch(() => {});
      }
    } catch (error) {
      setLoadError(error?.message || 'This live show is unavailable.');
    } finally {
      setLoading(false);
    }
  }, [broadcastId, loadChat, previewMode, refreshPresence]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (
      previewMode ||
      !show?.id ||
      ['completed', 'cancelled', 'failed'].includes(statusRef.current)
    ) return undefined;
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

    realtimeService.joinBroadcast(show.id).then((connectedSocket) => {
      if (!active) return;
      socket = connectedSocket;
      setRealtimeState('connected');

      const onMessage = (payload) => {
        const normalized = normalizeChatMessage(payload);
        if (normalized) setMessages((current) => mergeById(current, chatView(normalized)));
      };
      const onDeleted = ({ messageId } = {}) => setMessages((current) => current.filter((item) => !sameId(item.id, messageId)));
      const onReaction = ({ messageId, reactions } = {}) => setMessages((current) => current.map((item) => sameId(item.id, messageId) ? { ...item, reactions, reaction: reactions?.length || '' } : item));
      const onStatus = (payload) => {
        if (!sameId(payload?.broadcastId, show.id)) return;
        setShow((current) => current ? normalizeBroadcast({ ...current, ...payload }) : current);
      };
      const onDisconnect = () => { setRealtimeState('fallback'); fallback(); };
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
      onStatus(connectedSocket.__echooBroadcastSnapshots?.get(String(show.id)));
      socket.__echooRoomCleanup = () => {
        connectedSocket.off('chat:message', onMessage);
        connectedSocket.off('chat:messageDeleted', onDeleted);
        connectedSocket.off('chat:reaction', onReaction);
        connectedSocket.off('broadcast:status', onStatus);
        connectedSocket.off('presence:changed', refreshPresence);
        connectedSocket.off('disconnect', onDisconnect);
        connectedSocket.off('connect', onConnect);
      };
    }).catch((error) => {
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
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setShareMessage('Link copied');
    } catch {
      setShareMessage('Could not copy link');
    }
    window.setTimeout(() => setShareMessage(''), 1800);
  };

  const toggleFollow = async () => {
    if (previewMode || !show?.stationId) return setFollowing((value) => !value);
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
      setMessages((current) => [...current, { id: `local-${Date.now()}`, name: 'You', time: 'Now', text: content, reaction: '' }]);
      return true;
    }
    try {
      const response = await batch4Service.sendMessage(broadcastId, content);
      if (response?.data) setMessages((current) => mergeById(current, chatView(response.data)));
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
      setMessages((current) => current.map((item) => sameId(item.id, message.id) ? { ...item, reactions, reaction: reactions.length || '' } : item));
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

  if (loading) return <main className="listener-room-page"><div className="listener-room-state">Preparing the live room...</div></main>;
  if (!show) return <main className="listener-room-page"><button type="button" className="listener-room-back" onClick={() => navigate('/listen/live')}><FiArrowLeft /> Back to Live Now</button><div className="listener-room-state">{loadError || 'This live show is unavailable.'}</div></main>;

  return (
    <main className="listener-room-page">
      <button type="button" className="listener-room-back" onClick={() => navigate('/listen/live')}><FiArrowLeft /> Back to Live Now</button>
      {(shareMessage || loadError) && <div className="listener-room-notice" role="status">{shareMessage || loadError}</div>}
      <LiveRoomHeader show={show} joined={joined && isLive} following={following} onJoin={() => setJoined((value) => !value)} onFollow={toggleFollow} onShare={share} />

      <section className="listener-room-audio" aria-label="Live audio status">
        <div className="listener-room-audio__meta"><span><i /> {isLive ? 'LIVE' : show.status.toUpperCase()}</span><strong>{isLive ? (joined ? 'You are listening live' : 'Playback paused') : 'This broadcast has ended'}</strong><small><FiUsers /> {show.listenerCount.toLocaleString()} listeners</small></div>
        <Waveform live label="Live audio waveform" />
        <div className="listener-room-audio__state"><FiRadio aria-hidden="true" /><span><strong>{audioStatusLabel}</strong><small>{isLive ? `Live room ${realtimeState}` : 'The replay is being prepared'}</small></span></div>
      </section>

      <div className="llr-grid">
        <section className="llr-main">
          <article className="llr-player-card">
              <div className="llr-player-visual">
              {show?.artwork ? (
                <img className="llr-player-bg" src={show.artwork} alt="" />
              ) : (
                <div className="llr-player-placeholder">
                  <FaHeadphones />
                </div>
              )}
              <span className={`llr-player-live${isLive ? '' : ' llr-player-live-ended'}`}>
                <i /> {isLive ? 'LIVE' : ended ? 'ENDED' : 'SCHEDULED'}
              </span>
              <div className="llr-player-overlay">
                <span className="llr-player-title">{show?.title}</span>
                <span className="llr-player-subtitle">
                  {show?.description || 'Live audio on Echoo.'}
                </span>
              </div>
              {!previewMode && (
                <LiveKitListenerPlayer
                  broadcastId={show?.id}
                  isLive={isLive && joined}
                  track={playerTrack}
                  onStateChange={handleLivePlayerState}
                />
              )}
            </div>

              <div className="llr-player-controls">
                <button
                  type="button"
                  className="llr-ctrl-pause"
                  aria-label={liveState?.isPlaying ? 'Pause' : 'Play'}
                  disabled={!isLive || !!liveState?.playerError}
                  onClick={liveState?.onTogglePlay}
                >
                  {liveState?.isPlaying ? <FaPause /> : <FaPlay />}
                </button>
                <button
                  type="button"
                  className="llr-ctrl-volume"
                  aria-label={liveState?.isMuted ? 'Unmute' : 'Mute'}
                  onClick={liveState?.onToggleMute}
                  style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}
                >
                  {liveState?.isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                </button>
                {isLive && (
                  <span className="llr-controls-live-label">
                    <i /> LIVE
                  </span>
                )}
                <div
                  className="llr-controls-progress"
                  aria-label="Live stream progress"
                  role="progressbar"
                  aria-valuenow={isLive ? 100 : 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span className="llr-controls-progress-bar" />
                </div>
                <div className="llr-controls-icons">
                  <button type="button" className="llr-ctrl-icon" title="Picture in picture" aria-label="Picture in picture">
                    <FaTv />
                  </button>
                  <button type="button" className="llr-ctrl-icon llr-ctrl-icon-heart" title="Like this broadcast" aria-label="Like this broadcast">
                    <FaHeart />
                  </button>
                  <button type="button" className="llr-ctrl-icon" title="Fullscreen" aria-label="Fullscreen">
                    <FaExpand />
                  </button>
                </div>
              </div>
          </article>
          {!isLive && show?.replayAudioId && show?.assetVisibility?.audio !== 'private' && <button type="button" className="listener-room-replay" onClick={() => navigate(`/listen/audio/${show.replayAudioId}`)}>Open replay</button>}

      <div className="listener-room-intro"><strong>Live Audio + Community</strong><span>Listen to the show and join the listener conversation in one focused room.</span></div>

      <div className="listener-room-columns listener-room-columns--chat-only">
        <ChatPanel messages={messages} loading={chatLoading} disabled={!isLive} error={chatError} onSend={sendMessage} onReact={react} />
      </div>
        </section>
      </div>
    </main>
  );
};

export default ListenerRealLiveRoom;
