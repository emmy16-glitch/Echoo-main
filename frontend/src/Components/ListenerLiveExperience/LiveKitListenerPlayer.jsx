import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { FaHeadphones, FaRedoAlt, FaVolumeUp } from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import {
  LISTENER_PLAYBACK_WATCHDOG_MS,
  LIVE_RECOVERY_DELAYS_MS,
  mediaElementIsPlaying,
  mediaTrackIsLive,
  recoveryDelayMs,
  roomIsConnected,
} from '../../services/liveRecoveryPolicy';
import { resolveLiveKitUrl } from '../../services/livekitUrl';
import './LiveKitListenerPlayer.css';

const STATUS_COPY = {
  idle: 'Live audio',
  connecting: 'Creator connecting',
  waiting_for_program: 'Waiting for creator',
  playing: 'Audio live',
  reconnecting: 'Reconnecting…',
  recovering_audio: 'Recovering audio…',
  autoplay_blocked: 'Audio ready',
  disconnected: 'Audio disconnected',
  failed: 'Audio disconnected',
};

const isEchooProgramPublication = (publication) => {
  const name = String(
    publication?.trackName || publication?.name || publication?.track?.name || ''
  ).toLowerCase();

  // Primary match for our high-quality studio mix
  const isStudioMix =
    name === 'echoo-studio-mix' ||
    (import.meta.env.DEV && name === 'echoo-dev-test-audio');

  // Listener playback deliberately attaches only the canonical program track.
  // There is no listener AudioContext, resampler, speech enhancement or MP3
  // fallback here: `track.attach()` sends the negotiated LiveKit stereo Opus
  // directly to the browser media element. Rejecting other room audio also
  // prevents duplicate playback when guests publish talkback tracks.
  if (publication) {
    console.log(`[Echoo LiveKit] Track "${name}": studioMix=${isStudioMix}`);
  }

  return isStudioMix;
};

const LiveKitListenerPlayer = ({ broadcastId, isLive, track = null, onStateChange, guest = false }) => {
  const roomRef = useRef(null);
  const audioHostRef = useRef(null);
  const outputRef = useRef('');
  const attachedRef = useRef(new Map());
  const programParticipantRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const needsAudioStartRef = useRef(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [status, setStatus] = useState(isLive ? 'connecting' : 'idle');
  const [needsAudioStart, setNeedsAudioStart] = useState(false);
  const [error, setError] = useState('');
  const [outputs, setOutputs] = useState([]);
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [trackCount, setTrackCount] = useState(0);
  const [liveVolume, setLiveVolume] = useState(1);
  const [liveMuted, setLiveMuted] = useState(false);
  const [analyser, setAnalyser] = useState(null);
  const audioCtxRef = useRef(null);
  const [programAudioLevel, setProgramAudioLevel] = useState(0);

  useEffect(() => {
    outputRef.current = outputDeviceId;
  }, [outputDeviceId]);

  useEffect(() => {
    needsAudioStartRef.current = needsAudioStart;
  }, [needsAudioStart]);

  useEffect(() => {
    reconnectAttemptRef.current = 0;
    window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, [broadcastId, isLive]);

  useEffect(() => {
    if (!broadcastId || !isLive) return undefined;
    let disposed = false;
    let audioLevelTimer = null;
    let playbackWatchdogTimer = null;
    let smoothedAudioLevel = 0;

    const detachAttachment = (id) => {
      const entry = attachedRef.current.get(id);
      if (!entry) return;
      attachedRef.current.delete(id);
      try { entry.track?.detach?.(entry.element); } catch { /* already detached */ }
      try { entry.element?.pause?.(); } catch { /* already paused */ }
      entry.element?.remove?.();
      setTrackCount(attachedRef.current.size);
    };

    const clearAudio = () => {
      Array.from(attachedRef.current.keys()).forEach(detachAttachment);
      attachedRef.current.clear();
      programParticipantRef.current = null;
      smoothedAudioLevel = 0;
      setProgramAudioLevel(0);
      setTrackCount(0);
      setAnalyser(null);
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch { /* ignore */ }
        audioCtxRef.current = null;
      }
      audioHostRef.current?.querySelectorAll('audio').forEach((element) => {
        try { element.pause(); } catch { /* ignore */ }
        element.remove();
      });
    };

    const currentAttachmentIsHealthy = (entry) => Boolean(
      entry &&
      mediaTrackIsLive(entry.track) &&
      entry.element?.srcObject &&
      entry.element.isConnected &&
      !entry.element.ended
    );

    const markPlaybackState = () => {
      if (disposed) return false;
      const entries = Array.from(attachedRef.current.values());
      const playing = entries.some((entry) => currentAttachmentIsHealthy(entry) && mediaElementIsPlaying(entry.element));
      if (playing) {
        reconnectAttemptRef.current = 0;
        needsAudioStartRef.current = false;
        setNeedsAudioStart(false);
        setStatus('playing');
        return true;
      }
      if (entries.some(currentAttachmentIsHealthy)) {
        setStatus('recovering_audio');
      } else {
        setStatus('waiting_for_program');
      }
      return false;
    };

    const scheduleHardReconnect = (reason) => {
      if (disposed || reconnectTimerRef.current || !broadcastId || !isLive) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('reconnecting');
        return;
      }
      const attempt = reconnectAttemptRef.current;
      if (attempt >= LIVE_RECOVERY_DELAYS_MS.length) {
        setStatus('failed');
        setError('Live audio could not recover automatically. Retry the connection.');
        return;
      }
      reconnectAttemptRef.current += 1;
      setStatus('reconnecting');
      const delay = recoveryDelayMs(attempt);
      console.warn('[Echoo Live][Listener] scheduling hard reconnect', {
        broadcastId,
        attempt: attempt + 1,
        reason,
      });
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!disposed) setRetryVersion((current) => current + 1);
      }, delay);
    };

    const startProgramLevelTelemetry = () => {
      if (audioLevelTimer) window.clearInterval(audioLevelTimer);
      audioLevelTimer = window.setInterval(() => {
        if (disposed) return;
        const participant = programParticipantRef.current;
        const raw = Math.max(0, Math.min(1, Number(participant?.audioLevel) || 0));
        const target = raw < 0.012 ? 0 : Math.min(1, raw * 1.18);
        const response = target > smoothedAudioLevel ? 0.48 : 0.18;
        smoothedAudioLevel += (target - smoothedAudioLevel) * response;
        const next = smoothedAudioLevel < 0.006 ? 0 : smoothedAudioLevel;
        setProgramAudioLevel((current) => (
          Math.abs(current - next) >= 0.006 ? next : current
        ));
      }, 82);
    };

    const loadOutputs = async () => {
      try {
        const devices = await Room.getLocalDevices('audiooutput');
        if (!disposed) {
          setOutputs(devices.map((device) => ({
            deviceId: device.deviceId,
            label: device.label || 'Audio output',
          })));
        }
      } catch {
        if (!disposed) setOutputs([]);
      }
    };

    const attachAudio = async (
      track,
      publication = null,
      room = roomRef.current,
      participant = null
    ) => {
      if (
        disposed ||
        roomRef.current !== room ||
        track.kind !== Track.Kind.Audio ||
        !isEchooProgramPublication(publication)
      ) {
        return;
      }

      if (participant) programParticipantRef.current = participant;

      const id = String(track.sid || track.mediaStreamTrack?.id || 'audio');
      const existing = attachedRef.current.get(id);
      if (currentAttachmentIsHealthy(existing) && existing.track === track) {
        try {
          await existing.element.play();
          markPlaybackState();
        } catch (playError) {
          setNeedsAudioStart(true);
          needsAudioStartRef.current = true;
          setStatus(playError?.name === 'NotAllowedError' ? 'autoplay_blocked' : 'recovering_audio');
        }
        return;
      }
      if (existing) detachAttachment(id);
      // The listener must render exactly one canonical program element. A
      // creator republish can retain a prior SID briefly while the replacement
      // arrives, so stale attachments are explicitly removed here.
      Array.from(attachedRef.current.keys()).forEach(detachAttachment);

      console.log(`[Echoo LiveKit] Attaching track: ${id}`);
      const element = track.attach();
      element.autoplay = true;
      element.controls = false;
      element.muted = false;
      element.volume = 1;
      element.setAttribute('playsinline', '');
      element.style.display = 'block';

      if (outputRef.current && typeof element.setSinkId === 'function') {
        try { await element.setSinkId(outputRef.current); } catch { /* use system default */ }
      }

      if (disposed || roomRef.current !== room) {
        try { track.detach(element); } catch { /* ignore */ }
        element.remove();
        attachedRef.current.delete(id);
        return;
      }

      audioHostRef.current?.appendChild(element);
      attachedRef.current.set(id, { id, track, publication, element, room });
      setTrackCount(attachedRef.current.size);
      const onPlayable = () => markPlaybackState();
      const onEnded = () => {
        if (!disposed && roomRef.current === room) {
          detachAttachment(id);
          setStatus('recovering_audio');
        }
      };
      element.addEventListener('playing', onPlayable);
      element.addEventListener('canplay', onPlayable);
      element.addEventListener('ended', onEnded, { once: true });

      if (track.mediaStreamTrack && !audioCtxRef.current) {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          audioCtxRef.current = audioCtx;
          const createdAnalyser = audioCtx.createAnalyser();
          createdAnalyser.fftSize = 256;
          const source = audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
          source.connect(createdAnalyser);
          if (!disposed && roomRef.current === room) setAnalyser(createdAnalyser);
        } catch (err) {
          console.warn('[Echoo LiveKit] Could not create track analyser:', err);
        }
      }

      try {
        console.log(`[Echoo LiveKit] Attempting autoplay for track: ${id}`);
        await element.play();
        console.log(`[Echoo LiveKit] Autoplay SUCCESS for track: ${id}`);
        if (!disposed && roomRef.current === room) {
          setNeedsAudioStart(false);
          needsAudioStartRef.current = false;
          markPlaybackState();
        }
      } catch (playError) {
        console.warn(`[Echoo LiveKit] Autoplay BLOCKED for track: ${id}`, playError);
        if (!disposed && roomRef.current === room) {
          setNeedsAudioStart(true);
          needsAudioStartRef.current = true;
          setStatus(playError?.name === 'NotAllowedError' ? 'autoplay_blocked' : 'recovering_audio');
          if (playError?.name !== 'NotAllowedError') {
            setError(playError?.message || 'The live track arrived but playback did not start.');
          }
        }
      }
    };

    const subscribeToProgramPublication = async (publication, room, participant = null) => {
      if (!publication || !isEchooProgramPublication(publication)) return;
      if (participant) programParticipantRef.current = participant;

      if (publication.track?.kind === Track.Kind.Audio) {
        await attachAudio(publication.track, publication, room, participant);
        return;
      }

      // A Creator may already be live before this Listener joins. With
      // autoSubscribe enabled LiveKit normally handles this, but explicitly
      // requesting the subscription also covers publications announced during
      // the initial participant snapshot and avoids a silent waiting state.
      if (
        publication.kind === Track.Kind.Audio &&
        !publication.isSubscribed &&
        typeof publication.setSubscribed === 'function'
      ) {
        await publication.setSubscribed(true);
      }
    };

    const attachExisting = async (room) => {
      const tasks = [];
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          if (isEchooProgramPublication(publication)) {
            programParticipantRef.current = participant;
            tasks.push(subscribeToProgramPublication(publication, room, participant));
          }
        });
      });
      await Promise.allSettled(tasks);
      markPlaybackState();
    };

    const connect = async () => {
      setStatus(retryVersion > 0 ? 'recovering_audio' : 'connecting');
      setError('');
      setNeedsAudioStart(false);
      needsAudioStartRef.current = false;
      clearAudio();

      const previousRoom = roomRef.current;
      roomRef.current = null;
      if (previousRoom) {
        try { await previousRoom.disconnect(); } catch { /* ignore */ }
      }

      const credentials = guest
        ? await batch3Service.getGuestListenerToken(broadcastId)
        : await batch3Service.getListenerLiveKitToken(broadcastId);
      const liveKitUrl = resolveLiveKitUrl(credentials?.livekitUrl);
      if (!credentials?.token || !liveKitUrl) {
        throw new Error('Echoo did not return listener audio credentials.');
      }

      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;

      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        if (roomRef.current !== room || !isEchooProgramPublication(publication)) return;
        programParticipantRef.current = participant || programParticipantRef.current;
        subscribeToProgramPublication(publication, room, participant).catch((subscriptionError) => {
          if (!disposed && roomRef.current === room) {
            setError(subscriptionError?.message || 'Could not subscribe to live audio.');
          }
        });
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (roomRef.current !== room) return;
        attachAudio(track, publication, room, participant).catch((trackError) => {
          if (!disposed && roomRef.current === room) {
            setError(trackError?.message || 'Could not attach live audio.');
          }
        });
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
        if (roomRef.current !== room) return;
        const id = String(track.sid || track.mediaStreamTrack?.id || 'audio');
        if (!attachedRef.current.has(id)) return;
        detachAttachment(id);
        if (isEchooProgramPublication(publication)) {
          programParticipantRef.current = null;
          smoothedAudioLevel = 0;
          setProgramAudioLevel(0);
        }
        if (!disposed) {
          setStatus('recovering_audio');
        }
      });

      room.on(RoomEvent.Reconnecting, () => {
        if (!disposed && roomRef.current === room) setStatus('reconnecting');
      });
      room.on(RoomEvent.Reconnected, () => {
        if (!disposed && roomRef.current === room) {
          setStatus('recovering_audio');
          attachExisting(room).catch((recoveryError) => {
            setError(recoveryError?.message || 'Could not restore live audio.');
            scheduleHardReconnect('reattach_failed');
          });
        }
      });
      room.on(RoomEvent.Disconnected, (reason) => {
        if (!disposed && roomRef.current === room) {
          smoothedAudioLevel = 0;
          setProgramAudioLevel(0);
          setStatus('disconnected');
          scheduleHardReconnect(`room_disconnected:${String(reason ?? '')}`);
        }
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!disposed && roomRef.current === room) {
          const hasAudio = attachedRef.current.size > 0;
          const canPlay = room.canPlaybackAudio;
          setNeedsAudioStart(hasAudio && !canPlay);
          needsAudioStartRef.current = hasAudio && !canPlay;
          if (hasAudio && canPlay) markPlaybackState();
        }
      });
      room.on(RoomEvent.MediaDevicesChanged, loadOutputs);

      await room.connect(liveKitUrl, credentials.token, {
        autoSubscribe: true,
        maxRetries: 5,
        websocketTimeout: 15000,
        peerConnectionTimeout: 20000,
      });
      if (disposed || roomRef.current !== room) {
        await room.disconnect();
        return;
      }

      await loadOutputs();
      await attachExisting(room);
      startProgramLevelTelemetry();

      const audioElements = Array.from(
        audioHostRef.current?.querySelectorAll('audio') || []
      );
      const hasPlayingAudio = audioElements.some(
        (element) => !element.paused && !element.ended
      );
      reconnectAttemptRef.current = 0;
      setStatus(hasPlayingAudio ? 'playing' : attachedRef.current.size ? 'recovering_audio' : 'waiting_for_program');
      setNeedsAudioStart(
        attachedRef.current.size > 0 && !hasPlayingAudio
      );
      needsAudioStartRef.current = attachedRef.current.size > 0 && !hasPlayingAudio;
    };

    connect().catch(async (connectError) => {
      // The component renders the recoverable connection state below. Keep
      // expected unavailable-credentials/network failures out of console.error
      // so browser monitoring only treats uncaught application faults as errors.
      console.warn('[Echoo Listener LiveKit] Connection unavailable:', connectError?.message || connectError);

      // A failed ICE/signalling attempt can leave a partially-created Room in
      // memory. Disconnect it immediately instead of waiting for Retry/unmount.
      const failedRoom = roomRef.current;
      roomRef.current = null;
      clearAudio();
      if (failedRoom) {
        try { await failedRoom.disconnect(); } catch { /* ignore */ }
      }

      if (!disposed) {
        setStatus('failed');
        setError(connectError?.message || 'Could not connect to the live broadcast.');
        scheduleHardReconnect('connect_failed');
      }
    });

    const onOffline = () => {
      if (!disposed) setStatus('reconnecting');
    };
    const onOnline = () => {
      if (!disposed && !roomIsConnected(roomRef.current)) scheduleHardReconnect('browser_online');
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    playbackWatchdogTimer = window.setInterval(() => {
      if (disposed) return;
      const room = roomRef.current;
      if (!roomIsConnected(room)) return;
      const entries = Array.from(attachedRef.current.values());
      if (!entries.length || !entries.some(currentAttachmentIsHealthy)) {
        setStatus('recovering_audio');
        attachExisting(room).catch(() => scheduleHardReconnect('watchdog_missing_attachment'));
        return;
      }
      if (!entries.some((entry) => mediaElementIsPlaying(entry.element)) && !needsAudioStartRef.current) {
        setStatus('recovering_audio');
        entries.forEach((entry) => {
          entry.element.play().then(markPlaybackState).catch((playError) => {
            if (playError?.name === 'NotAllowedError') {
              setNeedsAudioStart(true);
              needsAudioStartRef.current = true;
              setStatus('autoplay_blocked');
            }
          });
        });
      }
    }, LISTENER_PLAYBACK_WATCHDOG_MS);

    return () => {
      disposed = true;
      if (audioLevelTimer) window.clearInterval(audioLevelTimer);
      if (playbackWatchdogTimer) window.clearInterval(playbackWatchdogTimer);
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      const room = roomRef.current;
      roomRef.current = null;
      clearAudio();
      if (room) room.disconnect().catch(() => {});
    };
  }, [broadcastId, isLive, retryVersion, guest]);

  const startAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      setError('');
      await room.startAudio();
      audioCtxRef.current?.resume?.();
      const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
      for (const element of elements) await element.play();
      setNeedsAudioStart(false);
      needsAudioStartRef.current = false;
      if (elements.length) setStatus('playing');
    } catch (startError) {
      setNeedsAudioStart(true);
      needsAudioStartRef.current = true;
      setError(startError?.message || 'Tap again to start the live audio.');
    }
  }, []);

  const togglePlayback = useCallback(async () => {
    if (needsAudioStart) {
      await startAudio();
      return;
    }

    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    if (!elements.length) return;
    const shouldPlay = elements.every((element) => element.paused);
    try {
      if (shouldPlay) audioCtxRef.current?.resume?.();
      await Promise.all(elements.map((element) => (shouldPlay ? element.play() : element.pause())));
      setStatus(shouldPlay ? 'playing' : 'idle');
    } catch (playError) {
      setNeedsAudioStart(true);
      needsAudioStartRef.current = true;
      setError(playError?.message || 'Tap again to start the live audio.');
    }
  }, [needsAudioStart, startAudio]);

  const toggleMute = useCallback(() => {
    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    const nextMuted = elements.some((element) => !element.muted);
    elements.forEach((element) => { element.muted = nextMuted; });
    setLiveMuted(nextMuted);
  }, []);

  // Lock-screen / background-tab controls (mobile browsers, minimized
  // windows): without these the OS shows no metadata and some platforms
  // deprioritize the page's audio. Playback itself already survives
  // backgrounding — this keeps the user in control while it does.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return undefined;
    if (!isLive) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch {
        // Media Session is best-effort enhancement.
      }
      return undefined;
    }
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track?.title || 'Live on Echoo',
        artist: track?.subtitle || 'Echoo Creator',
        album: 'Echoo Live',
        artwork: track?.coverArt
          ? [{ src: track.coverArt, sizes: '512x512', type: 'image/png' }]
          : [],
      });
    } catch {
      // Older browsers accept playback without metadata.
    }
    let disposed = false;
    const setHandlers = () => {
      if (disposed) return;
      try {
        navigator.mediaSession.setActionHandler('play', () => { void togglePlayback(); });
        navigator.mediaSession.setActionHandler('pause', () => { void togglePlayback(); });
        navigator.mediaSession.setActionHandler('stop', () => { void togglePlayback(); });
      } catch {
        // Unsupported actions throw per spec — safe to ignore.
      }
    };
    setHandlers();
    return () => {
      disposed = true;
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
      } catch {
        // Already torn down.
      }
    };
  }, [isLive, track?.title, track?.subtitle, track?.coverArt, togglePlayback]);

  const changeVolume = useCallback((value) => {
    const nextVolume = Math.max(0, Math.min(1, Number(value) || 0));
    const nextMuted = nextVolume === 0;
    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    elements.forEach((element) => {
      element.volume = nextVolume;
      element.muted = nextMuted;
    });
    setLiveVolume(nextVolume);
    setLiveMuted(nextMuted);
  }, []);

  const changeOutput = async (deviceId) => {
    setOutputDeviceId(deviceId);
    outputRef.current = deviceId;
    setError('');
    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    const target = deviceId || 'default';
    try {
      const configurable = elements.filter((element) => typeof element.setSinkId === 'function');
      if (deviceId && configurable.length === 0) {
        throw new Error('This browser does not support choosing a separate audio output device.');
      }
      for (const element of configurable) await element.setSinkId(target);
    } catch (outputError) {
      setError(outputError?.message || 'Could not switch the listening output.');
    }
  };

  useEffect(() => {
    onStateChange?.({
      active: Boolean(isLive),
      isPlaying: status === 'playing',
      track: isLive && track ? { ...track, isLive: true } : null,
      playerError: error,
      status,
      trackCount,
      needsAudioStart,
      volume: liveVolume,
      isMuted: liveMuted,
      analyser,
      audioLevel: programAudioLevel,
      onTogglePlay: togglePlayback,
      onToggleMute: toggleMute,
      onVolumeChange: changeVolume,
    });

    // Keep the lock-screen transport icon truthful (playing vs paused).
    try {
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && isLive) {
        navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : 'paused';
      }
    } catch {
      // Best-effort only.
    }

    return () => {
      onStateChange?.({ active: false, track: null, isPlaying: false, playerError: '', audioLevel: 0 });
    };
  }, [
    onStateChange,
    isLive,
    track,
    status,
    error,
    needsAudioStart,
    liveVolume,
    liveMuted,
    trackCount,
    analyser,
    programAudioLevel,
    togglePlayback,
    toggleMute,
    changeVolume,
  ]);

  if (!isLive) return null;

  const detail = needsAudioStart
    ? 'Audio received — tap to allow playback'
    : trackCount > 0
      ? status === 'recovering_audio'
        ? 'Studio mix found — restoring playback'
        : 'Echoo studio mix received'
      : 'Waiting for the creator to publish the studio mix';

  return (
    <section className={`echoo-livekit-listener ${status}`} aria-live="polite">
      <div className="echoo-livekit-listener-icon"><FaHeadphones /></div>

      <div className="echoo-livekit-listener-copy">
        <strong>{STATUS_COPY[status] || 'Live audio'}</strong>
        <span>{detail}</span>
        {error && <small>{error}</small>}
      </div>

      {outputs.length > 1 && (
        <label className="echoo-livekit-output-select">
          <FaVolumeUp aria-hidden="true" />
          <select value={outputDeviceId} onChange={(event) => changeOutput(event.target.value)}>
            <option value="">System default output</option>
            {outputs
              .filter((device) => device.deviceId && device.deviceId !== 'default')
              .map((device) => (
                <option value={device.deviceId} key={device.deviceId}>{device.label}</option>
              ))}
          </select>
        </label>
      )}

      {needsAudioStart && (
        <button type="button" className="echoo-livekit-start-audio" onClick={startAudio}>
          <FaHeadphones /> Tap to hear audio
        </button>
      )}

      {(status === 'failed' || status === 'disconnected') && (
        <button type="button" className="echoo-livekit-retry" onClick={() => {
          reconnectAttemptRef.current = 0;
          setRetryVersion((current) => current + 1);
        }}>
          <FaRedoAlt /> Reconnect
        </button>
      )}

      <div ref={audioHostRef} className="echoo-livekit-audio-host" aria-hidden="true" />
    </section>
  );
};

export default LiveKitListenerPlayer;
