import { readListenerVolume, saveListenerVolume } from '../../services/listenerVolume';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DefaultReconnectPolicy, Room, RoomEvent, Track } from 'livekit-client';
import { FaHeadphones, FaRedoAlt, FaVolumeUp } from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import {
  LISTENER_CONNECTION_LOST_GRACE_MS,
  LISTENER_HARD_RECONNECT_DEADLINE_MS,
  LISTENER_HARD_RECONNECT_JITTER_MS,
  LISTENER_PLAYBACK_WATCHDOG_MS,
  LISTENER_RTP_STALL_CONFIRMATIONS,
  LISTENER_RTP_STALL_MS,
  LIVE_RECOVERY_DELAYS_MS,
  LIVEKIT_RECONNECT_DELAYS_MS,
  mediaElementIsPlaying,
  mediaTrackIsLive,
  normalizeConnectionQuality,
  playoutDelayForConnectionQuality,
  recoveryDelayMs,
  roomCanCarryMedia,
  roomIsConnected,
  transportSampleAdvanced,
} from '../../services/liveRecoveryPolicy';
import { resolveLiveKitUrl } from '../../services/livekitUrl';
import { listenerLiveDetailCopy, listenerLiveStatusLabel } from '../../services/listenerLiveStatusCopy';
import './LiveKitListenerPlayer.css';

const createLiveKitReconnectPolicy = () =>
  new DefaultReconnectPolicy([...LIVEKIT_RECONNECT_DELAYS_MS]);



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

const LISTENER_CREDENTIAL_TIMEOUT_MS = 12_000;

const LiveKitListenerPlayer = ({ broadcastId, isLive, track = null, onStateChange, guest = false }) => {
  const roomRef = useRef(null);
  const audioHostRef = useRef(null);
  const outputRef = useRef('');
  const attachedRef = useRef(new Map());
  const attachGenerationRef = useRef(0);
  const programParticipantRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  // Stable per-listener jitter prevents hundreds of clients from performing
  // hard reconnect/token refresh in lockstep after the same network event.
  const reconnectJitterRef = useRef(0.5);
  // Consecutive watchdog misses while the room itself reports connected.
  // Transient mobile-network blips recover on their own — only a sustained
  // gap (several misses in a row) triggers a full room reconnect.
  const watchdogMissStreakRef = useRef(0);
  // LiveKit's own connection state. While it reports reconnecting, its
  // internal ICE/signalling recovery owns the outage and our watchdog must
  // hold (not tear the room down and start a reconnect storm).
  const roomLinkRef = useRef('connected');
  const needsAudioStartRef = useRef(false);
  const volumeRef = useRef(readListenerVolume());
  const mutedRef = useRef(readListenerVolume() === 0);
  const playbackIntentRef = useRef('play');
  const [retryVersion, setRetryVersion] = useState(0);
  const [status, setStatus] = useState(isLive ? 'connecting' : 'idle');
  const [needsAudioStart, setNeedsAudioStart] = useState(false);
  const [error, setError] = useState('');
  const [outputs, setOutputs] = useState([]);
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [trackCount, setTrackCount] = useState(0);
  const [liveVolume, setLiveVolume] = useState(readListenerVolume);
  const [liveMuted, setLiveMuted] = useState(() => readListenerVolume() === 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyser, setAnalyser] = useState(null);
  const audioCtxRef = useRef(null);
  const analyserSourceRef = useRef(null);
  const analyserTrackIdRef = useRef('');
  const [programAudioLevel, setProgramAudioLevel] = useState(0);
  const [networkQuality, setNetworkQuality] = useState('unknown');

  useEffect(() => {
    const applyPreference = () => {
      const volume = readListenerVolume();
      volumeRef.current = volume;
      mutedRef.current = volume === 0;
      setLiveVolume(volume);
      setLiveMuted(volume === 0);
      for (const element of audioHostRef.current?.querySelectorAll('audio') || []) {
        element.volume = volume;
        element.muted = volume === 0;
      }
    };
    applyPreference();
    window.addEventListener('echoo:listener-volume', applyPreference);
    return () => window.removeEventListener('echoo:listener-volume', applyPreference);
  }, [isLive]);

  useEffect(() => {
    reconnectJitterRef.current = Math.random();
  }, []);

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
    let connectionQualityTimer = null;
    let reconnectDeadlineTimer = null;
    let programStreamPausedTimer = null;
    let receiverCheckRunning = false;
    let localConnectionQuality = 'unknown';
    let creatorConnectionLost = false;
    let programStreamPaused = false;
    let smoothedAudioLevel = 0;

    const withDeadline = async (promise, timeoutMs, message) => {
      let timer = null;
      try {
        return await Promise.race([
          Promise.resolve(promise),
          new Promise((_, reject) => {
            timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
          }),
        ]);
      } finally {
        if (timer) window.clearTimeout(timer);
      }
    };

    const detachAttachment = (id) => {
      const entry = attachedRef.current.get(id);
      if (!entry) return;
      attachedRef.current.delete(id);
      if (analyserTrackIdRef.current === id) {
        try { analyserSourceRef.current?.disconnect?.(); } catch { /* already disconnected */ }
        analyserSourceRef.current = null;
        analyserTrackIdRef.current = '';
        setAnalyser(null);
      }
      try { entry.track?.detach?.(entry.element); } catch { /* already detached */ }
      try { entry.element?.pause?.(); } catch { /* already paused */ }
      entry.element?.remove?.();
      setTrackCount(attachedRef.current.size);
    };

    const clearAudio = () => {
      attachGenerationRef.current += 1;
      Array.from(attachedRef.current.keys()).forEach(detachAttachment);
      attachedRef.current.clear();
      programParticipantRef.current = null;
      smoothedAudioLevel = 0;
      setProgramAudioLevel(0);
      setTrackCount(0);
      setIsPlaying(false);
      setAnalyser(null);
      try { analyserSourceRef.current?.disconnect?.(); } catch { /* ignore */ }
      analyserSourceRef.current = null;
      analyserTrackIdRef.current = '';
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

    const clearConnectionQualityTimer = () => {
      if (!connectionQualityTimer) return;
      window.clearTimeout(connectionQualityTimer);
      connectionQualityTimer = null;
    };

    const clearReconnectDeadline = () => {
      if (!reconnectDeadlineTimer) return;
      window.clearTimeout(reconnectDeadlineTimer);
      reconnectDeadlineTimer = null;
    };

    const clearProgramStreamPausedTimer = () => {
      if (!programStreamPausedTimer) return;
      window.clearTimeout(programStreamPausedTimer);
      programStreamPausedTimer = null;
    };

    const applyPlayoutProtection = (track, quality = localConnectionQuality) => {
      if (!track || typeof track.setPlayoutDelay !== 'function') return;
      try {
        track.setPlayoutDelay(playoutDelayForConnectionQuality(quality));
      } catch {
        // Browser/WebRTC implementations may ignore playout-delay hints.
      }
    };

    const markPlaybackState = () => {
      if (disposed) return false;
      const entries = Array.from(attachedRef.current.values());
      const playing = entries.some((entry) => currentAttachmentIsHealthy(entry) && mediaElementIsPlaying(entry.element));
      if (playing) {
        reconnectAttemptRef.current = 0;
        watchdogMissStreakRef.current = 0;
        needsAudioStartRef.current = false;
        setNeedsAudioStart(false);
        setIsPlaying(true);
        setError('');
        setStatus('listening');
        return true;
      }
      if (playbackIntentRef.current === 'pause' && entries.some(currentAttachmentIsHealthy)) {
        needsAudioStartRef.current = false;
        setNeedsAudioStart(false);
        setIsPlaying(false);
        setStatus('connected');
        return false;
      }
      if (roomLinkRef.current === 'reconnecting') {
        // LiveKit is already repairing the transport. Hold the shared live
        // source instead of reporting the creator as gone.
        setStatus('holding');
        return false;
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
      // Never give up while the broadcast is still live: transient mobile
      // blips must not end in a permanent 'failed' state. Backoff grows to a
      // 30s ceiling and retries continue until the listener leaves.
      const attempt = reconnectAttemptRef.current;
      reconnectAttemptRef.current += 1;
      setStatus(roomLinkRef.current === 'reconnecting' ? 'holding' : 'reconnecting');
      const capped = attempt < LIVE_RECOVERY_DELAYS_MS.length
        ? recoveryDelayMs(attempt)
        : Math.min(30000, 8000 * 2 ** Math.min(4, attempt - LIVE_RECOVERY_DELAYS_MS.length));
      const jitterWindow = capped > 0
        ? Math.min(3000, Math.max(500, Math.round(capped * 0.25)))
        : 1000;
      const delay = Math.max(0, capped) + Math.round(reconnectJitterRef.current * jitterWindow);
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

    const armReconnectDeadline = (room) => {
      if (disposed || reconnectDeadlineTimer || roomRef.current !== room) return;
      const jitter = Math.round(
        reconnectJitterRef.current * LISTENER_HARD_RECONNECT_JITTER_MS
      );
      reconnectDeadlineTimer = window.setTimeout(() => {
        reconnectDeadlineTimer = null;
        if (disposed || roomRef.current !== room || roomIsConnected(room)) return;
        scheduleHardReconnect('reconnect_deadline_exceeded');
      }, LISTENER_HARD_RECONNECT_DEADLINE_MS + jitter);
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
      const attachGeneration = ++attachGenerationRef.current;
      const existing = attachedRef.current.get(id);
      if (currentAttachmentIsHealthy(existing) && existing.track === track) {
        if (playbackIntentRef.current === 'pause') {
          setNeedsAudioStart(false);
          needsAudioStartRef.current = false;
          setIsPlaying(false);
          setStatus('connected');
          return;
        }
        try {
          await existing.element.play();
          markPlaybackState();
        } catch (playError) {
          const blocked = playError?.name === 'NotAllowedError';
          setNeedsAudioStart(blocked);
          needsAudioStartRef.current = blocked;
          setStatus(blocked ? 'autoplay_blocked' : 'recovering_audio');
          if (!blocked) scheduleHardReconnect('existing_element_play_failed');
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
      element.muted = mutedRef.current;
      element.volume = volumeRef.current;
      element.setAttribute('playsinline', '');
      element.style.display = 'block';

      if (outputRef.current && typeof element.setSinkId === 'function') {
        try { await element.setSinkId(outputRef.current); } catch { /* use system default */ }
      }

      if (
        attachGeneration !== attachGenerationRef.current ||
        disposed ||
        roomRef.current !== room
      ) {
        try { track.detach(element); } catch { /* ignore */ }
        element.remove();
        attachedRef.current.delete(id);
        return;
      }

      audioHostRef.current?.appendChild(element);
      applyPlayoutProtection(track);
      attachedRef.current.set(id, {
        id,
        track,
        publication,
        element,
        room,
        receiverSample: null,
        receiverLastProgressAt: Date.now(),
        receiverStallSamples: 0,
      });
      setTrackCount(attachedRef.current.size);
      const onPlayable = () => markPlaybackState();
      const onEnded = () => {
        if (!disposed && roomRef.current === room) {
          detachAttachment(id);
          setStatus('recovering_audio');
          attachExisting(room).catch(() => scheduleHardReconnect('program_element_ended'));
        }
      };
      element.addEventListener('playing', onPlayable);
      element.addEventListener('canplay', onPlayable);
      element.addEventListener('ended', onEnded, { once: true });

      const syncElementPlayback = () => {
        if (disposed || roomRef.current !== room) return;
        const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
        const playing = elements.some((candidate) => !candidate.paused && !candidate.ended);
        setIsPlaying(playing);
        setStatus(playing ? 'listening' : 'connected');
      };
      element.addEventListener('play', syncElementPlayback);
      element.addEventListener('playing', syncElementPlayback);
      element.addEventListener('pause', syncElementPlayback);
      element.addEventListener('ended', syncElementPlayback);

      if (track.mediaStreamTrack) {
        try {
          let audioCtx = audioCtxRef.current;
          if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtxRef.current = audioCtx;
          }
          try { analyserSourceRef.current?.disconnect?.(); } catch { /* stale source */ }
          const createdAnalyser = audioCtx.createAnalyser();
          createdAnalyser.fftSize = 256;
          const source = audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
          source.connect(createdAnalyser);
          analyserSourceRef.current = source;
          analyserTrackIdRef.current = id;
          if (!disposed && roomRef.current === room) setAnalyser(createdAnalyser);
        } catch (err) {
          console.warn('[Echoo LiveKit] Could not create track analyser:', err);
        }
      }

      if (playbackIntentRef.current === 'pause') {
        setNeedsAudioStart(false);
        setIsPlaying(false);
        setStatus('connected');
        return;
      }

      try {
        console.log(`[Echoo LiveKit] Attempting autoplay for track: ${id}`);
        await element.play();
        console.log(`[Echoo LiveKit] Autoplay SUCCESS for track: ${id}`);
        if (!disposed && roomRef.current === room) {
          setNeedsAudioStart(false);
          needsAudioStartRef.current = false;
          markPlaybackState();
          setIsPlaying(true);
          setStatus('listening');
        }
      } catch (playError) {
        console.warn(`[Echoo LiveKit] Autoplay BLOCKED for track: ${id}`, playError);
        if (!disposed && roomRef.current === room) {
          const blocked = playError?.name === 'NotAllowedError';
          setNeedsAudioStart(blocked);
          needsAudioStartRef.current = blocked;
          setStatus(blocked ? 'autoplay_blocked' : 'recovering_audio');
          if (!blocked) {
            setError(playError?.message || 'The live track arrived but playback did not start.');
            scheduleHardReconnect('new_element_play_failed');
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

      // A Creator may already be live before this Listener joins. Because
      // autoSubscribe is intentionally disabled, explicitly request only the
      // canonical program publication from the initial participant snapshot
      // and later TrackPublished events.
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
      roomLinkRef.current = 'connecting';
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

      // Guest/account is an authorization concern only. From this call
      // forward every listener uses the exact same room, subscription,
      // attachment, autoplay and recovery path.
      const credentials = await withDeadline(
        batch3Service.getListenerCredentials(broadcastId, { guest }),
        LISTENER_CREDENTIAL_TIMEOUT_MS,
        'Echoo listener credentials timed out; retrying the live audio connection.'
      );
      const liveKitUrl = resolveLiveKitUrl(credentials?.livekitUrl);
      try {
        const host = liveKitUrl ? new URL(liveKitUrl).hostname : '';
        console.info('[Echoo Listener] credentials resolved', {
          broadcastId,
          authMode: credentials?.guest ? 'guest' : 'account',
          livekitHost: host,
          roomName: credentials?.roomName || '',
        });
      } catch {
        // Diagnostics are best-effort and must never block playback.
      }
      if (!credentials?.token || !liveKitUrl) {
        throw new Error('Echoo did not return listener audio credentials.');
      }

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        reconnectPolicy: createLiveKitReconnectPolicy(),
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackPublished, (publication, participant) => {
        if (roomRef.current !== room || !isEchooProgramPublication(publication)) return;
        creatorConnectionLost = false;
        programStreamPaused = false;
        clearProgramStreamPausedTimer();
        programParticipantRef.current = participant || programParticipantRef.current;
        subscribeToProgramPublication(publication, room, participant).catch((subscriptionError) => {
          if (!disposed && roomRef.current === room) {
            setError(subscriptionError?.message || 'Could not subscribe to live audio.');
          }
        });
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (roomRef.current !== room) return;
        if (isEchooProgramPublication(publication)) {
          creatorConnectionLost = false;
          programStreamPaused = false;
          clearProgramStreamPausedTimer();
        }
        attachAudio(track, publication, room, participant).catch((trackError) => {
          if (!disposed && roomRef.current === room) {
            setError(trackError?.message || 'Could not attach live audio.');
          }
        });
      });

      room.on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant) => {
        if (disposed || roomRef.current !== room) return;
        let failedProgram = false;
        participant?.trackPublications?.forEach?.((publication) => {
          if (publication?.trackSid === trackSid && isEchooProgramPublication(publication)) {
            failedProgram = true;
          }
        });
        if (!failedProgram) return;
        setStatus('recovering_audio');
        scheduleHardReconnect('program_subscription_failed');
      });

      room.on(RoomEvent.TrackStreamStateChanged, (publication, streamState) => {
        if (disposed || roomRef.current !== room || !isEchooProgramPublication(publication)) return;
        const nextState = String(streamState || '').toLowerCase();
        if (nextState === 'paused') {
          programStreamPaused = true;
          setStatus('holding');
          clearProgramStreamPausedTimer();
          programStreamPausedTimer = window.setTimeout(() => {
            programStreamPausedTimer = null;
            if (
              disposed ||
              roomRef.current !== room ||
              !programStreamPaused ||
              !isLive
            ) return;
            // A missing "active" event must never leave a listener holding
            // forever. Rejoin with fresh credentials while preserving the same
            // logical broadcast and playback intent.
            scheduleHardReconnect('program_stream_paused_timeout');
          }, LISTENER_RTP_STALL_MS);
          return;
        }
        if (nextState === 'active') {
          programStreamPaused = false;
          clearProgramStreamPausedTimer();
          attachExisting(room)
            .then(() => markPlaybackState())
            .catch(() => scheduleHardReconnect('program_stream_resume_failed'));
        }
      });

      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        if (disposed || roomRef.current !== room) return;
        const normalized = normalizeConnectionQuality(quality);

        if (participant === room.localParticipant) {
          localConnectionQuality = normalized;
          setNetworkQuality(normalized);
          attachedRef.current.forEach((entry) => applyPlayoutProtection(entry.track, normalized));

          if (normalized !== 'lost') {
            clearConnectionQualityTimer();
            return;
          }

          setStatus(attachedRef.current.size > 0 ? 'holding' : 'reconnecting');
          clearConnectionQualityTimer();
          connectionQualityTimer = window.setTimeout(() => {
            connectionQualityTimer = null;
            if (
              disposed ||
              roomRef.current !== room ||
              localConnectionQuality !== 'lost' ||
              !roomIsConnected(room) ||
              roomLinkRef.current === 'reconnecting'
            ) return;
            scheduleHardReconnect('listener_connection_quality_lost');
          }, LISTENER_CONNECTION_LOST_GRACE_MS);
          return;
        }

        if (participant === programParticipantRef.current) {
          creatorConnectionLost = normalized === 'lost';
          if (creatorConnectionLost) {
            // Creator-side loss affects every listener. Rejoining locally cannot
            // fix it, so keep the listener attached and wait for the creator's
            // recovery/republish path.
            setStatus('holding');
          }
        }
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
          if (attachedRef.current.size === 0) setIsPlaying(false);
          markPlaybackState();
        }
      });

      room.on(RoomEvent.SignalReconnecting, () => {
        if (!disposed && roomRef.current === room) {
          clearConnectionQualityTimer();
          roomLinkRef.current = 'signal_reconnecting';
          // Signalling can be interrupted while RTP continues. Keep playback
          // and receiver-health checks alive rather than forcing a new room.
          markPlaybackState();
        }
      });
      room.on(RoomEvent.Reconnecting, () => {
        if (!disposed && roomRef.current === room) {
          clearConnectionQualityTimer();
          roomLinkRef.current = 'reconnecting';
          armReconnectDeadline(room);
          setStatus(attachedRef.current.size > 0 ? 'holding' : 'reconnecting');
        }
      });
      room.on(RoomEvent.Reconnected, () => {
        if (!disposed && roomRef.current === room) {
          clearConnectionQualityTimer();
          clearReconnectDeadline();
          roomLinkRef.current = 'connected';
          watchdogMissStreakRef.current = 0;
          const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
          const playing = elements.some((element) => !element.paused && !element.ended);
          setIsPlaying(playing);
          setStatus(playing ? 'listening' : 'recovering_audio');
          attachExisting(room).catch((recoveryError) => {
            setError(recoveryError?.message || 'Could not restore live audio.');
            scheduleHardReconnect('reattach_failed');
          });
        }
      });
      room.on(RoomEvent.Disconnected, (reason) => {
        if (!disposed && roomRef.current === room) {
          clearConnectionQualityTimer();
          clearReconnectDeadline();
          roomLinkRef.current = 'reconnecting';
          smoothedAudioLevel = 0;
          setProgramAudioLevel(0);
          setIsPlaying(false);
          setStatus('disconnected');
          scheduleHardReconnect(`room_disconnected:${String(reason ?? '')}`);
        }
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!disposed && roomRef.current === room) {
          const hasAudio = attachedRef.current.size > 0;
          const canPlay = room.canPlaybackAudio;
          const playbackBlocked =
            hasAudio &&
            !canPlay &&
            playbackIntentRef.current === 'play';
          setNeedsAudioStart(playbackBlocked);
          needsAudioStartRef.current = playbackBlocked;
          const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
          const playing = elements.some((element) => !element.paused && !element.ended);
          setIsPlaying(playing);
          if (playing) setStatus('listening');
          else if (hasAudio) markPlaybackState();
        }
      });
      room.on(RoomEvent.MediaDevicesChanged, loadOutputs);

      await room.connect(liveKitUrl, credentials.token, {
        // Only the canonical Echoo program track is needed. Explicit
        // subscription below prevents guest/talkback/service tracks from
        // multiplying inbound media across large listener rooms.
        autoSubscribe: false,
        maxRetries: 7,
        websocketTimeout: 18000,
        peerConnectionTimeout: 22000,
      });
      if (disposed || roomRef.current !== room) {
        await room.disconnect();
        return;
      }

      await loadOutputs();
      await attachExisting(room);
      startProgramLevelTelemetry();
      roomLinkRef.current = 'connected';
      watchdogMissStreakRef.current = 0;

      const audioElements = Array.from(
        audioHostRef.current?.querySelectorAll('audio') || []
      );
      const hasPlayingAudio = audioElements.some(
        (element) => !element.paused && !element.ended
      );
      reconnectAttemptRef.current = 0;
      setIsPlaying(hasPlayingAudio);
      setStatus(hasPlayingAudio ? 'listening' : attachedRef.current.size ? 'recovering_audio' : 'waiting_for_program');
      const playbackBlocked =
        playbackIntentRef.current === 'play' &&
        attachedRef.current.size > 0 &&
        !hasPlayingAudio &&
        !room.canPlaybackAudio;
      setNeedsAudioStart(playbackBlocked);
      needsAudioStartRef.current = playbackBlocked;
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
      if (disposed) return;
      const room = roomRef.current;
      const hasHealthyAttachment = Array.from(attachedRef.current.values())
        .some(currentAttachmentIsHealthy);

      // Let LiveKit finish its native ICE/signalling recovery first. If the
      // room comes back but RTP stays frozen, the receiver-stats watchdog below
      // detects that silent transport stall and performs the hard rejoin.
      if (roomLinkRef.current === 'reconnecting') {
        setStatus(hasHealthyAttachment ? 'holding' : 'reconnecting');
        return;
      }
      if (!roomCanCarryMedia(room) || !hasHealthyAttachment) {
        scheduleHardReconnect('browser_online_missing_transport');
      }
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    playbackWatchdogTimer = window.setInterval(async () => {
      if (disposed || receiverCheckRunning) return;
      const room = roomRef.current;
      if (!roomCanCarryMedia(room)) return;
      // LiveKit's own transport recovery owns the outage — hold the shared
      // live source and stay quiet instead of tearing the room down.
      if (roomLinkRef.current === 'reconnecting') {
        setStatus(attachedRef.current.size > 0 ? 'holding' : 'reconnecting');
        return;
      }
      const entries = Array.from(attachedRef.current.values());
      if (!entries.length || !entries.some(currentAttachmentIsHealthy)) {
        watchdogMissStreakRef.current += 1;
        setStatus('recovering_audio');
        if (watchdogMissStreakRef.current >= 3) {
          watchdogMissStreakRef.current = 0;
          scheduleHardReconnect('watchdog_missing_attachment');
        } else {
          attachExisting(room).catch(() => scheduleHardReconnect('watchdog_missing_attachment'));
        }
        return;
      }
      watchdogMissStreakRef.current = 0;

      // DOM/media-element state alone is not enough: on some mobile/network
      // failures an <audio> element remains "playing" while inbound RTP has
      // stopped. Sample the canonical RemoteAudioTrack receiver counters and
      // rebuild only after a sustained confirmed RTP stall.
      receiverCheckRunning = true;
      try {
        for (const entry of entries) {
          if (
            !currentAttachmentIsHealthy(entry) ||
            entry.publication?.isMuted ||
            entry.track?.isMuted ||
            programStreamPaused ||
            String(entry.track?.streamState || '').toLowerCase() === 'paused' ||
            typeof entry.track?.getReceiverStats !== 'function'
          ) continue;

          const stats = await entry.track.getReceiverStats();
          if (!stats || disposed || roomRef.current !== room) continue;
          const sample = {
            bytes: Number(stats.bytesReceived) || 0,
            packets: Number(stats.packetsReceived) || 0,
          };

          if (transportSampleAdvanced(entry.receiverSample, sample)) {
            entry.receiverSample = sample;
            entry.receiverLastProgressAt = Date.now();
            entry.receiverStallSamples = 0;
            continue;
          }

          entry.receiverSample = sample;
          entry.receiverStallSamples = Number(entry.receiverStallSamples || 0) + 1;
          if (
            Date.now() - Number(entry.receiverLastProgressAt || 0) >= LISTENER_RTP_STALL_MS &&
            entry.receiverStallSamples >= LISTENER_RTP_STALL_CONFIRMATIONS
          ) {
            entry.receiverStallSamples = 0;
            setStatus('holding');
            if (!creatorConnectionLost) {
              scheduleHardReconnect('inbound_rtp_stall');
            }
            break;
          }
        }
      } catch (statsError) {
        console.warn('[Echoo Live][Listener] receiver diagnostics unavailable', statsError?.message || statsError);
      } finally {
        receiverCheckRunning = false;
      }

      if (
        playbackIntentRef.current === 'play' &&
        !entries.some((entry) => mediaElementIsPlaying(entry.element)) &&
        !needsAudioStartRef.current
      ) {
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
      clearProgramStreamPausedTimer();
      clearConnectionQualityTimer();
      clearReconnectDeadline();
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
    if (!room) return false;
    playbackIntentRef.current = 'play';
    try {
      setError('');
      await room.startAudio();
      await audioCtxRef.current?.resume?.();
      const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
      for (const element of elements) {
        element.volume = volumeRef.current;
        element.muted = mutedRef.current;
        await element.play();
      }
      setNeedsAudioStart(false);
      needsAudioStartRef.current = false;
      setIsPlaying(elements.length > 0);
      setStatus(elements.length ? 'listening' : 'recovering_audio');
      // room.startAudio() succeeded inside a real user gesture. Even when the
      // program publication arrives a moment later, LiveKit is now unlocked
      // and attachAudio() can start it without another authentication step.
      return true;
    } catch (startError) {
      setIsPlaying(false);
      setNeedsAudioStart(true);
      needsAudioStartRef.current = true;
      setError(startError?.message || 'Tap again to start the live audio.');
      return false;
    }
  }, []);

  // Browsers may reject audible autoplay after a hard reload even when the
  // listener was already playing before refresh. We still attempt autoplay
  // immediately; if policy blocks it, the next ordinary tap anywhere in the
  // live room unlocks audio. Explicit playback buttons keep their own handlers.
  useEffect(() => {
    if (!isLive || !needsAudioStart) return undefined;

    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      window.removeEventListener('pointerdown', resumeFromGesture, true);
      window.removeEventListener('keydown', resumeFromKeyboard, true);
    };
    const resumeFromGesture = (event) => {
      if (event.target?.closest?.('.echoo-livekit-start-audio, .listener-v2-room-play')) return;
      cleanup();
      void startAudio();
    };
    const resumeFromKeyboard = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      cleanup();
      void startAudio();
    };

    window.addEventListener('pointerdown', resumeFromGesture, true);
    window.addEventListener('keydown', resumeFromKeyboard, true);
    return cleanup;
  }, [isLive, needsAudioStart, startAudio]);

  const playAudio = useCallback(async () => {
    playbackIntentRef.current = 'play';

    // A listener may press Play from the persistent mini player after a hard
    // transport failure. In that state room.startAudio() cannot repair the
    // disconnected room; restart the connection supervisor instead. The
    // retained playback intent makes the fresh room resume audio automatically.
    if (status === 'failed' || status === 'disconnected') {
      setRetryVersion((current) => current + 1);
      return false;
    }

    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    // A guest can tap Play before the canonical program track finishes
    // subscribing. Use that gesture to unlock LiveKit audio immediately so
    // the later attachment can play without requiring account creation or a
    // second tap.
    if (needsAudioStart || !elements.length) return startAudio();
    try {
      setError('');
      await audioCtxRef.current?.resume?.();
      for (const element of elements) {
        element.volume = volumeRef.current;
        element.muted = mutedRef.current;
        await element.play();
      }
      setNeedsAudioStart(false);
      needsAudioStartRef.current = false;
      setIsPlaying(true);
      setStatus('listening');
      return true;
    } catch (playError) {
      setIsPlaying(false);
      setNeedsAudioStart(true);
      needsAudioStartRef.current = true;
      setError(playError?.message || 'Tap again to start the live audio.');
      return false;
    }
  }, [needsAudioStart, startAudio, status]);

  const pauseAudio = useCallback(() => {
    playbackIntentRef.current = 'pause';
    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    elements.forEach((element) => element.pause());
    setNeedsAudioStart(false);
    setIsPlaying(false);
    if (elements.length) setStatus('connected');
  }, []);

  const stopAudio = useCallback(() => {
    pauseAudio();
  }, [pauseAudio]);

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      pauseAudio();
      return;
    }
    await playAudio();
  }, [isPlaying, pauseAudio, playAudio]);

  const toggleMute = useCallback(() => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    elements.forEach((element) => { element.muted = nextMuted; });
    setLiveMuted(nextMuted);
  }, []);

  // Lock-screen / background-tab controls (mobile browsers, minimized
  // windows): without these the OS shows no metadata and some platforms
  // deprioritize the page's audio. Playback itself already survives
  // backgrounding — this keeps the user in control while it does.
  // Handlers map to discrete play/pause/stop so lock-screen buttons stay
  // truthful instead of toggling blindly.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return undefined;

    if (!isLive) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch {
        // Media Session is a best-effort enhancement.
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
    try {
      navigator.mediaSession.setActionHandler('play', () => { void playAudio(); });
      navigator.mediaSession.setActionHandler('pause', pauseAudio);
      navigator.mediaSession.setActionHandler('stop', stopAudio);
    } catch {
      // Unsupported Media Session features must not affect playback.
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
      } catch {
        // Already torn down.
      }
    };
  }, [isLive, track?.title, track?.subtitle, track?.coverArt, playAudio, pauseAudio, stopAudio]);

  const changeVolume = useCallback((value) => {
    const nextVolume = Math.max(0, Math.min(1, Number(value) || 0));
    const nextMuted = nextVolume === 0;
    saveListenerVolume(nextVolume);
    volumeRef.current = nextVolume;
    mutedRef.current = nextMuted;
    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    elements.forEach((element) => {
      element.volume = nextVolume;
      element.muted = nextMuted;
    });
    setLiveVolume(nextVolume);
    setLiveMuted(nextMuted);
  }, []);

  const changeOutput = async (deviceId) => {
    const previousDeviceId = outputRef.current;
    setError('');
    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    const target = deviceId || 'default';
    try {
      const configurable = elements.filter((element) => typeof element.setSinkId === 'function');
      if (deviceId && configurable.length === 0) {
        throw new Error('This browser does not support choosing a separate audio output device.');
      }
      for (const element of configurable) await element.setSinkId(target);
      outputRef.current = deviceId;
      setOutputDeviceId(deviceId);
    } catch (outputError) {
      outputRef.current = previousDeviceId;
      setOutputDeviceId(previousDeviceId);
      setError(outputError?.message || 'Could not switch the listening output.');
    }
  };

  useEffect(() => {
    try {
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && isLive) {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      }
    } catch {
      // Lock-screen transport state is best-effort only.
    }
  }, [isLive, isPlaying]);

  useEffect(() => {
    onStateChange?.({
      active: Boolean(isLive),
      isPlaying,
      playbackState: needsAudioStart
        ? 'blocked'
        : isPlaying
          ? 'playing'
          : trackCount > 0
            ? 'paused'
            : 'idle',
      connectionStatus: status,
      canPlay: trackCount > 0 || needsAudioStart,
      canReconnect: status === 'failed' || status === 'disconnected',
      userPaused: playbackIntentRef.current === 'pause',
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
      onPlay: playAudio,
      onPause: pauseAudio,
      onReconnect: () => setRetryVersion((current) => current + 1),
      onToggleMute: toggleMute,
      onVolumeChange: changeVolume,
    });

    // Keep the lock-screen transport icon truthful (playing vs paused).
    try {
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && isLive) {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
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
    isPlaying,
    error,
    needsAudioStart,
    liveVolume,
    liveMuted,
    trackCount,
    analyser,
    programAudioLevel,
    networkQuality,
    togglePlayback,
    playAudio,
    pauseAudio,
    toggleMute,
    changeVolume,
  ]);

  if (!isLive) return null;

  const detail = listenerLiveDetailCopy({
    needsAudioStart,
    trackCount,
    isPlaying,
    status,
  });

  const statusCopy =
    status === 'connected' && trackCount > 0 && !needsAudioStart
      ? 'Paused'
      : listenerLiveStatusLabel(status, 'Live audio');

  return (
    <section className={`echoo-livekit-listener ${status}`} aria-live="polite">
      <div className="echoo-livekit-listener-icon"><FaHeadphones /></div>

      <div className="echoo-livekit-listener-copy">
        <strong>{statusCopy}</strong>
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
