import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { FaHeadphones, FaRedoAlt, FaVolumeUp } from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import { resolveLiveKitUrl } from '../../services/livekitUrl';
import './LiveKitListenerPlayer.css';

const STATUS_COPY = {
  connecting: 'Creator connecting',
  connected: 'Waiting for creator',
  listening: 'Audio live',
  reconnecting: 'Audio disconnected',
  disconnected: 'Audio disconnected',
  error: 'Audio disconnected',
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

const LiveKitListenerPlayer = ({ broadcastId, isLive, track = null, onStateChange }) => {
  const roomRef = useRef(null);
  const audioHostRef = useRef(null);
  const outputRef = useRef('');
  const attachedRef = useRef(new Set());
  const [retryVersion, setRetryVersion] = useState(0);
  const [status, setStatus] = useState(isLive ? 'connecting' : 'disconnected');
  const [needsAudioStart, setNeedsAudioStart] = useState(false);
  const [error, setError] = useState('');
  const [outputs, setOutputs] = useState([]);
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [trackCount, setTrackCount] = useState(0);
  const [liveVolume, setLiveVolume] = useState(1);
  const [liveMuted, setLiveMuted] = useState(false);

  useEffect(() => {
    outputRef.current = outputDeviceId;
  }, [outputDeviceId]);

  useEffect(() => {
    if (!broadcastId || !isLive) return undefined;
    let disposed = false;

    const clearAudio = () => {
      attachedRef.current.clear();
      setTrackCount(0);
      audioHostRef.current?.querySelectorAll('audio').forEach((element) => {
        try { element.pause(); } catch { /* ignore */ }
        element.remove();
      });
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

    const attachAudio = async (track, publication = null, room = roomRef.current) => {
      if (
        disposed ||
        roomRef.current !== room ||
        track.kind !== Track.Kind.Audio ||
        !isEchooProgramPublication(publication)
      ) {
        return;
      }

      const id = String(track.sid || track.mediaStreamTrack?.id || 'audio');
      if (attachedRef.current.has(id)) return;
      attachedRef.current.add(id);

      console.log(`[Echoo LiveKit] Attaching track: ${id}`);
      const element = track.attach();
      element.autoplay = true;
      element.controls = false;
      element.muted = false;
      element.volume = 1;
      element.setAttribute('playsinline', '');
      element.style.display = 'block'; // Ensure it's not display:none

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
      setTrackCount((current) => current + 1);

      try {
        console.log(`[Echoo LiveKit] Attempting autoplay for track: ${id}`);
        await element.play();
        console.log(`[Echoo LiveKit] Autoplay SUCCESS for track: ${id}`);
        if (!disposed && roomRef.current === room) {
          setNeedsAudioStart(false);
          setStatus('listening');
        }
      } catch (playError) {
        console.warn(`[Echoo LiveKit] Autoplay BLOCKED for track: ${id}`, playError);
        if (!disposed && roomRef.current === room) {
          setNeedsAudioStart(true);
          setStatus('connected');
          if (playError?.name !== 'NotAllowedError') {
            setError(playError?.message || 'The live track arrived but playback did not start.');
          }
        }
      }
    };

    const subscribeToProgramPublication = async (publication, room) => {
      if (!publication || !isEchooProgramPublication(publication)) return;

      if (publication.track?.kind === Track.Kind.Audio) {
        await attachAudio(publication.track, publication, room);
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
            tasks.push(subscribeToProgramPublication(publication, room));
          }
        });
      });
      await Promise.allSettled(tasks);
    };

    const connect = async () => {
      setStatus('connecting');
      setError('');
      setNeedsAudioStart(false);
      clearAudio();

      const previousRoom = roomRef.current;
      roomRef.current = null;
      if (previousRoom) {
        try { await previousRoom.disconnect(); } catch { /* ignore */ }
      }

      const credentials = await batch3Service.getListenerLiveKitToken(broadcastId);
      const liveKitUrl = resolveLiveKitUrl(credentials?.livekitUrl);
      if (!credentials?.token || !liveKitUrl) {
        throw new Error('Echoo did not return listener audio credentials.');
      }

      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;

      room.on(RoomEvent.TrackPublished, (publication) => {
        if (roomRef.current !== room || !isEchooProgramPublication(publication)) return;
        subscribeToProgramPublication(publication, room).catch((subscriptionError) => {
          if (!disposed && roomRef.current === room) {
            setError(subscriptionError?.message || 'Could not subscribe to live audio.');
          }
        });
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication) => {
        if (roomRef.current !== room) return;
        attachAudio(track, publication, room).catch((trackError) => {
          if (!disposed && roomRef.current === room) {
            setError(trackError?.message || 'Could not attach live audio.');
          }
        });
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (roomRef.current !== room) return;
        const id = String(track.sid || track.mediaStreamTrack?.id || 'audio');
        if (!attachedRef.current.has(id)) return;
        attachedRef.current.delete(id);
        try { track.detach().forEach((element) => element.remove()); } catch { /* ignore */ }
        if (!disposed) {
          setTrackCount((current) => Math.max(0, current - 1));
          setStatus('connected');
        }
      });

      room.on(RoomEvent.Reconnecting, () => {
        if (!disposed && roomRef.current === room) setStatus('reconnecting');
      });
      room.on(RoomEvent.Reconnected, () => {
        if (!disposed && roomRef.current === room) {
          setStatus(attachedRef.current.size ? 'listening' : 'connected');
          attachExisting(room).catch(() => {});
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (!disposed && roomRef.current === room) setStatus('disconnected');
      });

      // LiveKit signals an expiring token through a Disconnect with
      // DisconnectReason.TokenExpired. Re-fetch credentials and reconnect
      // automatically instead of dropping the listener to a manual retry.
      room.on(RoomEvent.Disconnected, (reason) => {
        if (disposed || roomRef.current !== room) return;
        const tokenExpired =
          reason === 2 /* DisconnectReason.TokenExpired */ ||
          String(reason || '').toLowerCase().includes('token');
        if (tokenExpired && broadcastId && isLive) {
          setRetryVersion((current) => current + 1);
        }
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!disposed && roomRef.current === room) {
          const hasAudio = attachedRef.current.size > 0;
          const canPlay = room.canPlaybackAudio;
          setNeedsAudioStart(hasAudio && !canPlay);
          if (hasAudio && canPlay) setStatus('listening');
        }
      });
      room.on(RoomEvent.MediaDevicesChanged, loadOutputs);

      await room.connect(liveKitUrl, credentials.token, { autoSubscribe: true });
      if (disposed || roomRef.current !== room) {
        await room.disconnect();
        return;
      }

      await loadOutputs();
      await attachExisting(room);

      const audioElements = Array.from(
        audioHostRef.current?.querySelectorAll('audio') || []
      );
      const hasPlayingAudio = audioElements.some(
        (element) => !element.paused && !element.ended
      );
      setStatus(hasPlayingAudio ? 'listening' : 'connected');
      setNeedsAudioStart(
        attachedRef.current.size > 0 && !hasPlayingAudio
      );
    };

    connect().catch(async (connectError) => {
      console.error('[Echoo Listener LiveKit]', connectError);

      // A failed ICE/signalling attempt can leave a partially-created Room in
      // memory. Disconnect it immediately instead of waiting for Retry/unmount.
      const failedRoom = roomRef.current;
      roomRef.current = null;
      clearAudio();
      if (failedRoom) {
        try { await failedRoom.disconnect(); } catch { /* ignore */ }
      }

      if (!disposed) {
        setStatus('error');
        setError(connectError?.message || 'Could not connect to the live broadcast.');
      }
    });

    return () => {
      disposed = true;
      const room = roomRef.current;
      roomRef.current = null;
      clearAudio();
      if (room) room.disconnect().catch(() => {});
    };
  }, [broadcastId, isLive, retryVersion]);

  const startAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      setError('');
      await room.startAudio();
      const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
      for (const element of elements) await element.play();
      setNeedsAudioStart(false);
      if (elements.length) setStatus('listening');
    } catch (startError) {
      setNeedsAudioStart(true);
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
      await Promise.all(elements.map((element) => (shouldPlay ? element.play() : element.pause())));
      setStatus(shouldPlay ? 'listening' : 'connected');
    } catch (playError) {
      setNeedsAudioStart(true);
      setError(playError?.message || 'Tap again to start the live audio.');
    }
  }, [needsAudioStart, startAudio]);

  const toggleMute = useCallback(() => {
    const elements = Array.from(audioHostRef.current?.querySelectorAll('audio') || []);
    const nextMuted = elements.some((element) => !element.muted);
    elements.forEach((element) => { element.muted = nextMuted; });
    setLiveMuted(nextMuted);
  }, []);

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
      isPlaying: status === 'listening',
      track: isLive && track ? { ...track, isLive: true } : null,
      playerError: error,
      status,
      trackCount,
      needsAudioStart,
      volume: liveVolume,
      isMuted: liveMuted,
      onTogglePlay: togglePlayback,
      onToggleMute: toggleMute,
      onVolumeChange: changeVolume,
    });

    return () => {
      onStateChange?.({ active: false, track: null, isPlaying: false, playerError: '' });
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
    togglePlayback,
    toggleMute,
    changeVolume,
  ]);

  if (!isLive) return null;

  const detail = needsAudioStart
    ? 'Audio received — tap to allow playback'
    : trackCount > 0
      ? 'Echoo studio mix received'
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

      {(status === 'error' || status === 'disconnected') && (
        <button type="button" className="echoo-livekit-retry" onClick={() => setRetryVersion((current) => current + 1)}>
          <FaRedoAlt /> Reconnect
        </button>
      )}

      <div ref={audioHostRef} className="echoo-livekit-audio-host" aria-hidden="true" />
    </section>
  );
};

export default LiveKitListenerPlayer;
