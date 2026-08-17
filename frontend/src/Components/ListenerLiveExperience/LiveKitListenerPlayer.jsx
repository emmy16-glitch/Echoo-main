import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import {
  FaHeadphones,
  FaRedoAlt,
} from 'react-icons/fa';

import batch3Service from '../../services/batch3Service';
import './LiveKitListenerPlayer.css';

const STATUS_COPY = {
  connecting: 'Connecting live audio...',
  connected: 'Connected — waiting for audio',
  listening: 'Listening live',
  reconnecting: 'Reconnecting live audio...',
  disconnected: 'Live audio disconnected',
  error: 'Could not connect to live audio',
};

const LiveKitListenerPlayer = ({
  broadcastId,
  isLive,
}) => {
  const roomRef = useRef(null);
  const audioHostRef = useRef(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [status, setStatus] = useState(
    isLive ? 'connecting' : 'disconnected'
  );
  const [needsAudioStart, setNeedsAudioStart] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!broadcastId || !isLive) return undefined;

    let disposed = false;

    const clearAudio = () => {
      const host = audioHostRef.current;
      if (!host) return;

      host.querySelectorAll('audio').forEach((element) => {
        try {
          element.pause();
        } catch {
          // Ignore cleanup errors.
        }
        element.remove();
      });
    };

    const connect = async () => {
      setStatus('connecting');
      setError('');
      setNeedsAudioStart(false);
      clearAudio();

      const previousRoom = roomRef.current;
      roomRef.current = null;

      if (previousRoom) {
        try {
          await previousRoom.disconnect();
        } catch {
          // Ignore old room cleanup.
        }
      }

      const credentials = await batch3Service.getListenerLiveKitToken(
        broadcastId
      );

      if (!credentials?.token || !credentials?.livekitUrl) {
        throw new Error(
          'Echoo did not return listener audio credentials.'
        );
      }

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
      });

      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (disposed || track.kind !== Track.Kind.Audio) return;

        const element = track.attach();
        element.autoplay = true;
        element.controls = false;
        element.setAttribute('playsinline', '');
        audioHostRef.current?.appendChild(element);
        setStatus('listening');
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        try {
          track.detach().forEach((element) => element.remove());
        } catch {
          // Ignore detached element cleanup.
        }
      });

      room.on(RoomEvent.Reconnecting, () => {
        if (!disposed) setStatus('reconnecting');
      });

      room.on(RoomEvent.Reconnected, () => {
        if (!disposed) setStatus('connected');
      });

      room.on(RoomEvent.Disconnected, () => {
        if (!disposed) setStatus('disconnected');
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!disposed) setNeedsAudioStart(!room.canPlaybackAudio);
      });

      await room.connect(credentials.livekitUrl, credentials.token, {
        autoSubscribe: true,
      });

      if (disposed) {
        await room.disconnect();
        return;
      }

      setStatus('connected');
      setNeedsAudioStart(!room.canPlaybackAudio);
    };

    connect().catch((connectError) => {
      console.error('[Echoo Listener LiveKit]', connectError);
      if (!disposed) {
        setStatus('error');
        setError(
          connectError?.message ||
            'Could not connect to the live broadcast.'
        );
      }
    });

    return () => {
      disposed = true;
      const room = roomRef.current;
      roomRef.current = null;
      clearAudio();

      if (room) {
        try {
          room.disconnect();
        } catch {
          // Ignore cleanup.
        }
      }
    };
  }, [broadcastId, isLive, retryVersion]);

  const startAudio = async () => {
    const room = roomRef.current;
    if (!room) return;

    try {
      await room.startAudio();
      setNeedsAudioStart(false);
    } catch (startError) {
      setError(
        startError?.message || 'Tap again to start the live audio.'
      );
    }
  };

  if (!isLive) return null;

  return (
    <section
      className={`echoo-livekit-listener ${status}`}
      aria-live="polite"
    >
      <div className="echoo-livekit-listener-icon">
        <FaHeadphones />
      </div>

      <div className="echoo-livekit-listener-copy">
        <strong>{STATUS_COPY[status] || 'Live audio'}</strong>
        <span>Real-time Echoo audio</span>
        {error && <small>{error}</small>}
      </div>

      {needsAudioStart && (
        <button
          type="button"
          className="echoo-livekit-start-audio"
          onClick={startAudio}
        >
          <FaHeadphones /> Tap to hear audio
        </button>
      )}

      {(status === 'error' || status === 'disconnected') && (
        <button
          type="button"
          className="echoo-livekit-retry"
          onClick={() => setRetryVersion((current) => current + 1)}
        >
          <FaRedoAlt /> Reconnect
        </button>
      )}

      <div
        ref={audioHostRef}
        className="echoo-livekit-audio-host"
        aria-hidden="true"
      />
    </section>
  );
};

export default LiveKitListenerPlayer;
