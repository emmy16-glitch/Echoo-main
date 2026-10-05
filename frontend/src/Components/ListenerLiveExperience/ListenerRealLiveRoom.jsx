import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  FaExpand,
  FaHeadphones,
  FaPause,
  FaPlay,
  FaRedoAlt,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';
import { FiArrowLeft, FiHeart, FiBookmark, FiCheck, FiLink, FiMessageCircle, FiMoreHorizontal, FiRadio, FiShare2, FiUsers, FiX } from 'react-icons/fi';

import batch3Service from '../../services/batch3Service';
import batch4Service, { normalizeChatMessage } from '../../services/batch4Service';
import followService from '../../services/followService';
import realtimeService from '../../services/realtimeService';
import { getGuestSession } from '../../services/guestSession';
import { copyTextToClipboard } from '../../services/stationPublicUrl';
import savedMomentService from '../../services/savedMomentService';
import { apiRequest, buildMediaUrl } from '../../services/api';
import { notifyDesktop, onDesktopRoomCommand, setDesktopRoomState } from '../../services/desktopBridge';
import { buildGeneratedStationBrandCoverUrl } from '../../stationBranding/stationBranding';
import { ChatPanel } from '../../design-system';
import { referenceChat, referenceLiveShows } from '../ListenerExperience/listenerExperienceData';
import BroadcastWaveform from '../CreatorStudio/BroadcastWaveform';
import echooMark from '../Assets/echoo-logo-official.svg';
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
  listenerCount: (() => {
    const rawCount = item?.listenerCount ?? item?.station?.listenerCount;
    if (rawCount == null || rawCount === '') return null;
    const count = Number(rawCount);
    return Number.isFinite(count) ? Math.max(0, count) : null;
  })(),
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
  description: item?.description || '',
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
  const { setLiveSession, livePlayerState: liveState } = useOutletContext() || {};
  const stageRef = useRef(null);
  const liveStateRef = useRef(liveState);
  liveStateRef.current = liveState;

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
  const [followPending, setFollowPending] = useState(false);
  const [liked, setLiked] = useState(false);
  const [savedMomentId, setSavedMomentId] = useState('');
  const [actionPending, setActionPending] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  // Shared listen links: no access token → guest mode. Guests get the public
  // broadcast card, a guest realtime seat, and subscriber-only LiveKit audio.
  // Chat stays read-only and follow/react need an account (see the CTAs).
  const isGuest =
    !previewMode &&
    typeof window !== 'undefined' &&
    !localStorage.getItem('accessToken');
  const guestId = useMemo(() => {
    if (!isGuest) return '';
    try {
      return getGuestSession()?.id || '';
    } catch {
      return '';
    }
  }, [isGuest]);
  const [, setRealtimeState] = useState('connecting');
  const [audioState, setAudioState] = useState('connecting');
  const statusRef = useRef(show?.status || '');
  const roomLoadGenerationRef = useRef(0);
  const chatLoadGenerationRef = useRef(0);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!chatOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setChatOpen(false);
    };
    const viewport = window.visualViewport;
    const updateViewport = () => {
      document.documentElement.style.setProperty('--listener-chat-height', `${viewport?.height || window.innerHeight}px`);
      document.documentElement.style.setProperty('--listener-chat-keyboard', `${Math.max(0, window.innerHeight - (viewport?.height || window.innerHeight) - (viewport?.offsetTop || 0))}px`);
    };
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    document.documentElement.classList.add('listener-v2-chat-open');
    window.addEventListener('keydown', onKeyDown);
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      document.documentElement.style.removeProperty('--listener-chat-height');
      document.documentElement.style.removeProperty('--listener-chat-keyboard');
      document.documentElement.classList.remove('listener-v2-chat-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [chatOpen]);

  useEffect(() => {
    setChatOpen(false);
    if (previewMode) return;

    // Route changes must start from a clean room. In-flight requests from the
    // previous broadcast are invalidated below so they cannot repaint stale
    // chat, presence, follow, like, or saved state into the new room.
    roomLoadGenerationRef.current += 1;
    chatLoadGenerationRef.current += 1;
    setShow(null);
    setLoading(true);
    setChatLoading(true);
    setMessages([]);
    setLoadError('');
    setChatError('');
    setFollowing(false);
    setFollowPending(false);
    setLiked(false);
    setSavedMomentId('');
    setActionPending('');
    setShareMessage('');
    setRealtimeState('connecting');
    setAudioState('connecting');
    statusRef.current = '';
  }, [broadcastId, previewMode]);

  const ended = show
    ? !['live', 'scheduled'].includes(String(show.status || '').toLowerCase())
    : false;
  const isLive = show?.status === 'live';
  const isScheduled = show?.status === 'scheduled';
  const scheduledStartLabel = (() => {
    if (!isScheduled || !show?.startTime) return 'Waiting for scheduled start';
    const date = new Date(show.startTime);
    if (Number.isNaN(date.getTime())) return 'Waiting for scheduled start';
    return `Starts ${date.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  })();

  useEffect(() => {
    statusRef.current = show?.status || '';
  }, [show?.status]);

  useEffect(() => {
    if (liveState?.status) setAudioState(liveState.status);
  }, [liveState?.status]);

  useEffect(() => {
    const active = Boolean(isLive && joined);
    setDesktopRoomState({
      active,
      mode: active ? 'listener' : 'idle',
      kind: active ? 'live' : 'idle',
      title: active ? show?.title || 'Live on Echoo' : '',
      muted: Boolean(liveState?.isMuted),
      playing: Boolean(active && liveState?.isPlaying),
      canToggleMute: typeof liveState?.onToggleMute === 'function',
      canTogglePlay: false,
      keepAwake: false,
    });

    return () => {
      setDesktopRoomState({
        active: false,
        mode: 'idle',
        kind: 'idle',
        title: '',
        muted: false,
        playing: false,
        canToggleMute: false,
        canTogglePlay: false,
        keepAwake: false,
      });
    };
  }, [
    isLive,
    joined,
    liveState?.isMuted,
    liveState?.isPlaying,
    liveState?.onToggleMute,
    show?.title,
  ]);

  // LiveKit publishes level/connection telemetry frequently. Keep the native
  // tray listener stable instead of tearing down/re-registering IPC callbacks
  // whenever that telemetry object changes.
  useEffect(
    () =>
      onDesktopRoomCommand((command) => {
        if (command === 'toggle-mute') liveStateRef.current?.onToggleMute?.();
        if (command === 'leave-room') {
          setJoined(false);
          setLiveSession(null);
          navigate('/listen/live');
        }
      }),
    [navigate, setLiveSession]
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

  useEffect(() => {
    if (previewMode || !show || !setLiveSession) return;
    setLiveSession({ broadcastId: show.id, isLive: isLive && joined, track: playerTrack, guest: isGuest });
    // The shell owns playback. Navigating away intentionally keeps it mounted.
  }, [previewMode, show, isLive, joined, playerTrack, isGuest, setLiveSession]);

  const refreshPresence = useCallback(async () => {
    if (previewMode || !broadcastId) return;
    try {
      const presence = await batch3Service.getPresence(broadcastId);
      setShow((current) =>
        sameId(current?.id, broadcastId)
          ? {
              ...current,
              status: presence.status || current.status,
              listenerCount:
                presence.listenerCount == null || presence.listenerCount === ''
                  ? current.listenerCount
                  : Number.isFinite(Number(presence.listenerCount))
                    ? Math.max(0, Number(presence.listenerCount))
                    : current.listenerCount,
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
      const generation = ++chatLoadGenerationRef.current;
      // Chat history stays lazy-loaded so large audience joins do not stampede
      // the API. Guests receive only the sanitized public-history endpoint.
      if (!silent) setChatLoading(true);
      try {
        const response = isGuest
          ? await batch4Service.getPublicMessages(broadcastId, { limit: 100 })
          : await batch4Service.getMessages(broadcastId, { limit: 100 });
        if (generation !== chatLoadGenerationRef.current) return;
        const history = Array.isArray(response?.data)
          ? response.data.map(chatView)
          : [];
        setMessages((current) => {
          let next = history;
          for (const message of current) next = mergeById(next, message);
          return next;
        });
        setChatError('');
      } catch (error) {
        if (!silent && generation === chatLoadGenerationRef.current) {
          setChatError(error?.message || 'Live chat is unavailable.');
        }
      } finally {
        if (!silent && generation === chatLoadGenerationRef.current) setChatLoading(false);
      }
    },
    [broadcastId, previewMode, isGuest]
  );

  const load = useCallback(async () => {
    if (!broadcastId || previewMode) return;
    const generation = ++roomLoadGenerationRef.current;
    try {
      setLoading(true);
      const response = isGuest
        ? await batch3Service.getPublicBroadcast(broadcastId)
        : await batch3Service.getBroadcast(broadcastId);
      if (generation !== roomLoadGenerationRef.current) return;
      if (!response?.data) {
        throw new Error('This live broadcast could not be found.');
      }
      const next = normalizeBroadcast(response.data);
      setShow(next);
      setFollowing(false);
      setLoadError('');
      if (!isGuest && next.stationId) {
        followService
          .getStationStatus(next.stationId)
          .then((status) => {
            if (generation === roomLoadGenerationRef.current) {
              setFollowing(Boolean(status?.isFollowing));
            }
          })
          .catch(() => {});
      }
    } catch (error) {
      if (generation !== roomLoadGenerationRef.current) return;
      // Logged-out visitors hit the auth wall here — that is "not signed
      // in", not an expired session, so say so instead of alarming them.
      if (!localStorage.getItem('accessToken') && !isGuest) {
        setLoadError('Sign in to watch this live broadcast.');
      } else {
        setLoadError(error?.message || 'This live broadcast is unavailable.');
      }
    } finally {
      if (generation === roomLoadGenerationRef.current) setLoading(false);
    }
  }, [broadcastId, previewMode, isGuest]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!chatOpen || previewMode) return;
    void loadChat();
  }, [chatOpen, previewMode, isGuest, loadChat]);

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

      const poll = () => {
        void refreshPresence();
        // Spread fallback HTTP traffic so a realtime outage does not make a
        // large audience hit the API on the same 15-second boundary.
        const delay = 25_000 + Math.round(Math.random() * 20_000);
        fallbackTimer = window.setTimeout(poll, delay);
      };

      const initialDelay = 3_000 + Math.round(Math.random() * 7_000);
      fallbackTimer = window.setTimeout(poll, initialDelay);
    };

    const joinRoom = isGuest
      ? realtimeService.joinBroadcastAsGuest(show.id, { guestId })
      : realtimeService.joinBroadcast(show.id);
    joinRoom
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
        const onPresence = (payload) => {
          if (!sameId(payload?.broadcastId, show.id)) return;
          setShow((current) =>
            sameId(current?.id, show.id)
              ? {
                  ...current,
                  status: payload?.status || current.status,
                  listenerCount:
                    payload?.listenerCount == null || payload?.listenerCount === ''
                      ? current.listenerCount
                      : Number.isFinite(Number(payload.listenerCount))
                        ? Math.max(0, Number(payload.listenerCount))
                        : current.listenerCount,
                  mediaState: payload?.mediaState || current.mediaState,
                }
              : current
          );
        };

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
            sameId(current?.id, show.id)
              ? normalizeBroadcast({ ...current, ...payload })
              : current
          );
        };
        const onDisconnect = () => {
          setRealtimeState('fallback');
          fallback();
        };
        const onConnect = () => {
          setRealtimeState('connected');
          if (fallbackTimer) window.clearTimeout(fallbackTimer);
          fallbackTimer = null;
          connectedSocket.emit('broadcast:join', { broadcastId: show.id });
        };

        connectedSocket.on('chat:message', onMessage);
        connectedSocket.on('chat:messageDeleted', onDeleted);
        connectedSocket.on('chat:reaction', onReaction);
        connectedSocket.on('broadcast:status', onStatus);
        connectedSocket.on('presence:changed', onPresence);
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
          connectedSocket.off('presence:changed', onPresence);
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
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      socket?.__echooRoomCleanup?.();
      realtimeService.leaveBroadcast(show.id).catch(() => {});
    };
  }, [broadcastId, loadChat, previewMode, refreshPresence, show?.id, isGuest, guestId]);

  useEffect(() => {
    setLiked(false);
    setSavedMomentId('');
    if (isGuest || previewMode || !broadcastId) return;
    let active = true;
    apiRequest(`/broadcasts/${encodeURIComponent(broadcastId)}/like`).then(response => { if (active) setLiked(Boolean(response?.data?.liked)); }).catch(() => {});
    savedMomentService.list({ limit: 100 }).then(response => { if (active) setSavedMomentId(response.data.find(moment => String(moment.broadcastId) === String(broadcastId) && moment.timestampMs === 0)?.id || ''); }).catch(() => {});
    return () => { active = false; };
  }, [broadcastId, isGuest, previewMode]);

  const listenerAction = async (kind) => {
    if (actionPending) return;
    if (isGuest) { navigate('/?mode=login'); return; }
    const wasLiked = liked;
    setActionPending(kind);
    if (kind === 'like') setLiked(!wasLiked);
    try {
      if (kind === 'like') await apiRequest(`/broadcasts/${encodeURIComponent(broadcastId)}/like`, { method: wasLiked ? 'DELETE' : 'PUT' });
      else if (savedMomentId) { await savedMomentService.remove(savedMomentId); setSavedMomentId(''); }
      else { const response = await savedMomentService.create({ broadcastId, timestampMs: 0 }); setSavedMomentId(response.data.id); }
      setShareMessage(kind === 'like' ? (wasLiked ? 'Like removed' : 'Liked') : (savedMomentId ? 'Removed from Saved' : 'Saved to Library'));
    } catch (error) { if (kind === 'like') setLiked(wasLiked); setShareMessage(error.message || 'Could not update. Try again.'); }
    finally { setActionPending(''); }
  };

  const share = async (copyOnly = false) => {
    // Shared links must be absolute web URLs: prefer the configured public
    // app origin, else the current page (dev browsers). file:// (packaged
    // desktop without a configured origin) cannot produce a shareable link.
    const configuredOrigin = String(import.meta.env?.VITE_PUBLIC_APP_ORIGIN || '').trim().replace(/\/$/, '');
    const pageHref = window.location.href;
    const url = configuredOrigin
      ? `${configuredOrigin}/listen/live/${encodeURIComponent(broadcastId)}`
      : /^https?:\/\//i.test(pageHref)
        ? pageHref.split('?')[0]
        : '';
    if (!url) {
      setShareMessage('Open this room in a browser to share its link');
      window.setTimeout(() => setShareMessage(''), 1800);
      return;
    }
    try {
      if (!copyOnly && navigator.share) {
        await navigator.share({ title: show?.title || 'Live on Echoo', url });
        setShareMessage('Shared');
      } else {
        await copyTextToClipboard(url);
        setShareMessage('Live link copied');
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setShareMessage('Could not share this live link');
    }
    window.setTimeout(() => setShareMessage(''), 1800);
  };

  const toggleFollow = async () => {
    if (followPending) return;
    if (previewMode) {
      setFollowing((value) => !value);
      return;
    }

    // A real follow must have a durable station identity. Never make the UI
    // look successful when there is nothing the backend can persist.
    if (!show?.stationId) {
      setShareMessage('Follow is unavailable for this broadcast');
      window.setTimeout(() => setShareMessage(''), 1800);
      return;
    }

    if (isGuest) {
      navigate({ pathname: '/', search: '?mode=login' });
      return;
    }

    const wasFollowing = following;
    setFollowPending(true);
    setLoadError('');
    setFollowing(!wasFollowing);
    try {
      if (wasFollowing) await followService.unfollowStation(show.stationId);
      else await followService.followStation(show.stationId);
    } catch (error) {
      setFollowing(wasFollowing);
      setLoadError(error?.message || 'Could not update your follow status.');
    } finally { setFollowPending(false); }
  };

  const sendMessage = async (content) => {
    if (isGuest) {
      setChatError('Sign in to join the live chat.');
      return false;
    }
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
    if (isGuest) {
      setChatError('Sign in to react to messages.');
      return;
    }
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

  const connectionStatus = liveState?.connectionStatus || audioState;
  const hasProgramTrack = Number(liveState?.trackCount) > 0;
  const needsReconnect = Boolean(liveState?.canReconnect);
  const audioStatusLabel = isScheduled
    ? scheduledStartLabel
    : !isLive
      ? 'Broadcast ended'
      : show.mediaState === 'audio_paused'
      ? 'Broadcast paused'
      : connectionStatus === 'holding'
        ? 'Weak connection — staying live'
        : connectionStatus === 'reconnecting'
        ? 'Reconnecting audio…'
        : needsReconnect
          ? 'Audio disconnected'
          : liveState?.needsAudioStart || audioState === 'autoplay_blocked'
            ? 'Tap Play to hear audio'
            : liveState?.isPlaying || audioState === 'playing'
              ? 'Audio live'
              : hasProgramTrack
                ? 'Paused'
                : audioState === 'recovering_audio'
                  ? 'Recovering audio…'
                  : audioState === 'waiting_for_program'
                    ? 'Waiting for creator'
                    : connectionStatus === 'connecting' || show.mediaState === 'creator_connecting'
                    ? 'Creator connecting'
                    : connectionStatus === 'connected' || show.mediaState === 'waiting_for_creator'
                      ? 'Waiting for creator'
                      : 'Audio disconnected';

  const primaryPlaybackDisabled =
    !isLive ||
    (!needsReconnect &&
      !liveState?.needsAudioStart &&
      !hasProgramTrack &&
      ['connecting', 'reconnecting'].includes(connectionStatus));

  const togglePlayback = () => {
    if (!isLive) return;
    if (!joined) {
      setJoined(true);
      return;
    }
    if (needsReconnect) {
      liveState?.onReconnect?.();
      return;
    }
    liveState?.onTogglePlay?.();
  };

  const audioLevelPercent = liveState?.isPlaying
    ? Math.max(0, Math.min(100, Math.round((Number(liveState?.audioLevel) || 0) * 100)))
    : 0;

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
        <div>{loadError || 'This live broadcast is unavailable.'}</div>
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
          {show.stationId && (
            <button
              type="button"
              className={`listener-v2-room-follow${following ? ' is-following' : ''}`}
              onClick={toggleFollow}
              disabled={followPending}
              aria-pressed={following}
            >
              <FiHeart aria-hidden="true" />
              <span>{followPending ? 'Updating…' : following ? 'Following' : 'Follow'}</span>
            </button>
          )}
          <button
            type="button"
            className="listener-v2-room-icon-action"
            onClick={() => share()}
            aria-label="Share live broadcast"
          >
            <FiShare2 aria-hidden="true" />
            <span>Share</span>
          </button>
          <details className="listener-room-actions">
            <summary aria-label="More live broadcast actions">
              <FiMoreHorizontal aria-hidden="true" />
              <span>More</span>
            </summary>
            <div role="menu">
              <button type="button" role="menuitem" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); share(true); }}>
                <FiLink aria-hidden="true" /><span>Copy link</span>
              </button>
              <button type="button" role="menuitem" disabled={Boolean(actionPending)} aria-pressed={liked} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); listenerAction('like'); }}>
                <FiHeart aria-hidden="true" /><span>{liked ? 'Liked' : 'Like'}</span>
              </button>
              <button type="button" role="menuitem" disabled={Boolean(actionPending)} aria-pressed={Boolean(savedMomentId)} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); listenerAction('save'); }}>
                <FiBookmark aria-hidden="true" /><span>{savedMomentId ? 'Saved' : 'Save'}</span>
              </button>
            </div>
          </details>
        </div>
      </header>

      {(shareMessage || loadError) && (
        <div className="listener-v2-room-notice" role="status">
          {shareMessage || loadError}
        </div>
      )}

      <section className="listener-v2-room-grid">
        <article
          className="listener-v2-room-stage"
          ref={stageRef}
          style={show.artwork ? { '--listener-room-artwork': `url("${show.artwork}")` } : undefined}
        >
          <img className="listener-v2-room-watermark" src={echooMark} alt="" aria-hidden="true" />
          {isLive && (
            <div className="listener-v2-room-waveform-wrap">
              <BroadcastWaveform
                live={isLive}
                analyser={liveState?.analyser}
                mode={
                  liveState?.isPlaying
                    ? 'live'
                    : hasProgramTrack
                      ? 'paused'
                      : 'idle'
                }
              />
            </div>
          )}
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
                isLive ? '' : isScheduled ? ' is-scheduled' : ' is-ended'
              }`}
            >
              <FiRadio /> {isLive ? 'LIVE' : ended ? 'ENDED' : 'SCHEDULED'}
            </span>
          </div>

          <div className="listener-v2-room-event-copy">
            <div>
              <h1>{show.title}</h1>
              {show.creator && String(show.creator).trim().toLowerCase() !== String(show.title).trim().toLowerCase() && (
                <span className="listener-v2-room-creator">{show.creator}</span>
              )}
              {show.description &&
                ![show.title, show.creator].some((value) =>
                  String(value || '').trim().toLowerCase() === String(show.description || '').trim().toLowerCase()
                ) && <p>{show.description}</p>}
            </div>
            <div className="listener-v2-room-event-meta">
              {show.listenerCount != null && <span><FiUsers /> {show.listenerCount.toLocaleString()} listening</span>}
            </div>
          </div>


          {isLive && joined && Boolean(liveState?.needsAudioStart) && (
            <button
              type="button"
              className="listener-v2-room-tap-to-play"
              onClick={togglePlayback}
            >
              <FaPlay aria-hidden="true" />
              <span>
                <strong>Tap to hear the live audio</strong>
                <small>Your browser blocked autoplay — one tap starts it</small>
              </span>
            </button>
          )}

          <div className="listener-v2-room-controls">
            <button
              type="button"
              onClick={liveState?.onToggleMute}
              aria-label={liveState?.isMuted ? 'Unmute' : 'Mute'}
              disabled={!isLive || !hasProgramTrack}
            >
              {liveState?.isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>

            <label className="listener-v2-room-volume">
              <FaVolumeUp aria-hidden="true" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={Number.isFinite(Number(liveState?.volume)) ? Number(liveState.volume) : 1}
                aria-label="Live volume"
                disabled={!isLive || !hasProgramTrack}
                onChange={(event) => liveState?.onVolumeChange?.(event.target.value)}
              />
            </label>

            <div className="listener-v2-room-control-center">
              <button
                type="button"
                className="listener-v2-room-play"
                aria-label={needsReconnect ? 'Reconnect audio' : liveState?.isPlaying ? 'Pause' : 'Play'}
                disabled={primaryPlaybackDisabled}
                onClick={togglePlayback}
              >
                {needsReconnect ? <FaRedoAlt /> : liveState?.isPlaying ? <FaPause /> : <FaPlay />}
              </button>
              <span>{audioStatusLabel}</span>
            </div>

            <div
              className="listener-v2-room-live-line"
              role="meter"
              aria-label="Live audio level"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={audioLevelPercent}
            >
              <span style={{ width: `${audioLevelPercent}%` }} />
            </div>

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
                Open recording
              </button>
            )}
        </article>

        <button
          type="button"
          className="listener-v2-room-chat-toggle"
          onClick={() => setChatOpen((open) => !open)}
          aria-expanded={chatOpen}
          aria-controls="listener-live-chat"
        >
          <FiMessageCircle /> {chatOpen ? 'Hide chat' : 'Chat'}
        </button>
        {chatOpen && (
          <button
            type="button"
            className="listener-v2-room-chat-backdrop"
            aria-label="Close live chat"
            onClick={() => setChatOpen(false)}
          />
        )}
        <aside
          id="listener-live-chat"
          className={`listener-v2-room-chat${chatOpen ? ' is-open' : ''}${isGuest ? ' is-guest' : ''}`}
          aria-label="Live chat"
        >
          <div className="listener-v2-room-chat-top">
            <div className="listener-v2-room-chat-title">
              <strong>Live chat</strong>
              {isGuest && <span>Guest</span>}
            </div>
            <div className="listener-v2-room-chat-top-actions">
              {isGuest && (
                <button
                  type="button"
                  className="listener-v2-room-chat-signin"
                  onClick={() => navigate({ pathname: '/', search: '?mode=login' })}
                >
                  Sign in
                </button>
              )}
              <button
                type="button"
                className="listener-v2-room-chat-close"
                aria-label="Close live chat"
                onClick={() => setChatOpen(false)}
              >
                <FiX />
              </button>
            </div>
          </div>
          <ChatPanel
            messages={messages}
            loading={chatLoading}
            disabled={!isLive || isGuest}
            error={chatError}
            showHeader={false}
            showComposer={!isGuest}
            emptyMessage={isGuest ? 'No messages yet.' : isLive ? 'Be the first to join the conversation.' : 'This live chat has ended.'}
            composerPlaceholder={isLive ? 'Message live chat...' : 'Live chat has ended'}
            onSend={sendMessage}
            onReact={isGuest || !isLive ? undefined : react}
          />
        </aside>
      </section>
    </main>
  );
};

export default ListenerRealLiveRoom;
