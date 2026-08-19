import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaDownload,
  FaGlobe,
  FaLock,
  FaPause,
  FaPlay,
  FaStepBackward,
  FaStepForward,
  FaTimes,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';

import { buildMediaUrl } from '../../services/api.js';
import studioService from '../../services/studioService.js';
import './CreatorAudioDetailModal.css';

const getId = (track) => track?.id || track?._id || null;

const formatClock = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (!value) return 'Stored original';
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 ** 3)).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
};

const formatType = (mimeType = '') => {
  const value = String(mimeType).toLowerCase();
  if (value.includes('webm')) return 'Opus / WebM';
  if (value.includes('ogg') || value.includes('opus')) return 'Opus / OGG';
  if (value.includes('mpeg') || value.includes('mp3')) return 'MP3';
  if (value.includes('wav')) return 'WAV';
  if (value.includes('flac')) return 'FLAC';
  if (value.includes('aac') || value.includes('m4a')) return 'AAC / M4A';
  return mimeType || 'Original format';
};

const CreatorAudioDetailModal = ({ track, onClose, onChanged }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [visibility, setVisibility] = useState(Boolean(track?.isPublic));
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const fileUrl = useMemo(
    () => buildMediaUrl(track?.fileUrl || track?.audioUrl || ''),
    [track]
  );
  const artwork = useMemo(
    () => buildMediaUrl(track?.coverArt || track?.artwork || track?.image || ''),
    [track]
  );

  useEffect(() => {
    setVisibility(Boolean(track?.isPublic));
  }, [track?.isPublic]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const syncMetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const syncTime = () => setCurrentTime(audio.currentTime || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => setError('Echoo could not load this audio file from the backend.');

    audio.addEventListener('loadedmetadata', syncMetadata);
    audio.addEventListener('durationchange', syncMetadata);
    audio.addEventListener('timeupdate', syncTime);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', syncMetadata);
      audio.removeEventListener('durationchange', syncMetadata);
      audio.removeEventListener('timeupdate', syncTime);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [fileUrl]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!track) return null;

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !fileUrl) return;
    setError('');

    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (playError) {
      setError(playError?.message || 'Playback could not start.');
    }
  };

  const seekTo = (value) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : duration;
    const next = Math.max(0, Math.min(Number(value) || 0, max || Number(value) || 0));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const seekBy = (seconds) => {
    seekTo((audioRef.current?.currentTime || currentTime) + seconds);
  };

  const changeVolume = (value) => {
    const next = Math.max(0, Math.min(1, Number(value) || 0));
    setVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
    if (next > 0 && muted) {
      setMuted(false);
      if (audioRef.current) audioRef.current.muted = false;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  };

  const toggleVisibility = async () => {
    const id = getId(track);
    if (!id || visibilitySaving) return;

    try {
      setVisibilitySaving(true);
      setError('');
      const nextPublic = !visibility;
      const response = await studioService.updateAudio(id, { isPublic: nextPublic });
      setVisibility(Boolean(response?.data?.isPublic ?? nextPublic));
      window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
      onChanged?.();
    } catch (visibilityError) {
      setError(visibilityError?.message || 'Could not update audio visibility.');
    } finally {
      setVisibilitySaving(false);
    }
  };

  const downloadOriginal = async () => {
    const id = getId(track);
    if (!id || downloading) return;

    try {
      setDownloading(true);
      setError('');
      await studioService.downloadAudio(id, {
        title: track.title,
        originalName: track.originalName,
        mimeType: track.mimeType,
      });
    } catch (downloadError) {
      setError(downloadError?.message || 'Could not download the original audio file.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="creator-audio-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className="creator-audio-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-audio-modal-title"
      >
        <button
          type="button"
          className="creator-audio-modal-close"
          onClick={onClose}
          aria-label="Close audio player"
        >
          <FaTimes />
        </button>

        <div className="creator-audio-modal-artwork">
          {artwork ? (
            <img src={artwork} alt="" />
          ) : (
            <span>{String(track.title || 'E').charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div className="creator-audio-modal-content">
          <div className="creator-audio-modal-heading">
            <span>AUDIO LIBRARY</span>
            <h2 id="creator-audio-modal-title">{track.title || 'Untitled Audio'}</h2>
            <p>{track.description || 'No description added.'}</p>
          </div>

          <div className="creator-audio-modal-tags">
            <span>{track.genre || 'Other'}</span>
            <span className={visibility ? 'public' : 'private'}>
              {visibility ? <><FaGlobe /> Public</> : <><FaLock /> Private</>}
            </span>
            <span>{formatType(track.mimeType)}</span>
            <span>{formatBytes(track.fileSize)}</span>
          </div>

          <audio ref={audioRef} src={fileUrl || undefined} preload="metadata" />

          <div className="creator-audio-transport">
            <div className="creator-audio-seek-row">
              <span>{formatClock(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={Math.max(duration, 0)}
                step="0.1"
                value={Math.min(currentTime, Math.max(duration, 0))}
                onChange={(event) => seekTo(event.target.value)}
                disabled={!fileUrl || !duration}
                aria-label="Audio position"
              />
              <span>{formatClock(duration)}</span>
            </div>

            <div className="creator-audio-transport-controls">
              <div className="creator-audio-skip-controls">
                <button type="button" onClick={() => seekBy(-15)} disabled={!fileUrl} title="Back 15 seconds">
                  <FaStepBackward /> <span>-15s</span>
                </button>
                <button type="button" className="primary" onClick={togglePlayback} disabled={!fileUrl} aria-label={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? <FaPause /> : <FaPlay />}
                </button>
                <button type="button" onClick={() => seekBy(30)} disabled={!fileUrl} title="Forward 30 seconds">
                  <span>+30s</span> <FaStepForward />
                </button>
              </div>

              <div className="creator-audio-volume">
                <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
                  {muted || volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(event) => changeVolume(event.target.value)}
                  aria-label="Volume"
                />
              </div>
            </div>
          </div>

          {error && <div className="creator-audio-modal-error" role="alert">{error}</div>}

          <div className="creator-audio-modal-actions">
            <button type="button" onClick={toggleVisibility} disabled={visibilitySaving}>
              {visibility ? <FaLock /> : <FaGlobe />}
              {visibilitySaving
                ? 'Saving...'
                : visibility
                  ? 'Make private'
                  : 'Publish to listeners'}
            </button>

            <button type="button" className="download" onClick={downloadOriginal} disabled={downloading}>
              <FaDownload /> {downloading ? 'Preparing download...' : 'Download original'}
            </button>
          </div>

          <p className="creator-audio-quality-note">
            Downloads use the exact file stored by Echoo. No extra audio transcoding is applied during download.
          </p>
        </div>
      </section>
    </div>
  );
};

export default CreatorAudioDetailModal;
