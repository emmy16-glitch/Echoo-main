import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaDownload,
  FaEdit,
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
import { CREATOR_RENAME_UNDO_WINDOW_MS } from '../../config/playerFeedback.js';
import Toast from '../UI/Toast';
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
  const initializedTrackRef = useRef(null);
  const [fileUrl, setFileUrl] = useState('');
  const [streamLoading, setStreamLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [visibility, setVisibility] = useState(Boolean(track?.isPublic));
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [titleDraft, setTitleDraft] = useState(track?.title || '');
  const [savedTitle, setSavedTitle] = useState(track?.title || '');
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [renameToast, setRenameToast] = useState({
    open: false,
    title: '',
    message: '',
    undoTitle: '',
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const trackId = getId(track);
  const legacyFileUrl = useMemo(
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
    const trackKey = String(track?.id || track?._id || '');
    if (initializedTrackRef.current === trackKey) return;

    initializedTrackRef.current = trackKey;
    setTitleDraft(track?.title || '');
    setSavedTitle(track?.title || '');
    setTitleEditing(false);
    setRenameToast({ open: false, title: '', message: '', undoTitle: '' });
  }, [track?.id, track?._id, track?.title]);

  useEffect(() => {
    let active = true;
    setFileUrl('');
    setDuration(0);
    setCurrentTime(0);
    setError('');

    const prepareStream = async () => {
      if (!trackId) {
        if (active) setFileUrl(legacyFileUrl || '');
        return;
      }

      try {
        setStreamLoading(true);
        const stream = await studioService.getAudioStreamUrl(trackId);
        if (active) setFileUrl(stream.streamUrl);
      } catch (streamError) {
        if (active) {
          setError(streamError?.message || 'Echoo could not prepare this audio for playback.');
        }
      } finally {
        if (active) setStreamLoading(false);
      }
    };

    prepareStream();
    return () => {
      active = false;
    };
  }, [trackId, legacyFileUrl]);

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
    const handleError = () => setError('Echoo could not load this protected audio stream.');

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

  const saveTitle = async () => {
    const id = getId(track);
    const title = titleDraft.trim();

    if (!id || titleSaving) return;
    if (!title) {
      setError('Give this audio a title before saving.');
      return;
    }

    if (title === savedTitle.trim()) {
      setTitleEditing(false);
      return;
    }

    try {
      setTitleSaving(true);
      setError('');
      await studioService.updateAudio(id, { title });
      setTitleDraft(title);
      setSavedTitle(title);
      setTitleEditing(false);
      setRenameToast({
        open: true,
        title: 'Audio renamed',
        message: `“${title}” is updated in your library.`,
        undoTitle: savedTitle,
      });
      window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
      onChanged?.();
    } catch (titleError) {
      setError(titleError?.message || 'Could not rename this audio.');
    } finally {
      setTitleSaving(false);
    }
  };

  const undoTitleRename = async () => {
    const id = getId(track);
    const priorTitle = String(renameToast.undoTitle || '').trim();

    if (!id || !priorTitle || titleSaving) return;

    try {
      setTitleSaving(true);
      setError('');
      await studioService.updateAudio(id, { title: priorTitle });
      setTitleDraft(priorTitle);
      setSavedTitle(priorTitle);
      setTitleEditing(false);
      setRenameToast({
        open: true,
        title: 'Rename reverted',
        message: `“${priorTitle}” is restored in your library.`,
        undoTitle: '',
      });
      window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
      onChanged?.();
    } catch (titleError) {
      setError(titleError?.message || 'Could not undo this audio rename.');
    } finally {
      setTitleSaving(false);
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
      <Toast
        open={renameToast.open}
        type="success"
        title={renameToast.title}
        message={renameToast.message}
        duration={CREATOR_RENAME_UNDO_WINDOW_MS}
        actionLabel={renameToast.undoTitle ? 'Undo' : ''}
        onAction={renameToast.undoTitle ? undoTitleRename : undefined}
        actionDisabled={titleSaving}
        showCountdown={Boolean(renameToast.undoTitle)}
        onClose={() => setRenameToast((current) => ({ ...current, open: false }))}
      />
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
            {titleEditing ? (
              <div className="creator-audio-title-editor">
                <label htmlFor="creator-audio-title">Audio title</label>
                <div>
                  <input
                    id="creator-audio-title"
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveTitle();
                      if (event.key === 'Escape') {
                        setTitleDraft(track.title || '');
                        setTitleEditing(false);
                      }
                    }}
                    maxLength="160"
                    autoFocus
                    aria-describedby="creator-audio-title-help"
                  />
                  <button type="button" onClick={saveTitle} disabled={titleSaving}>
                    {titleSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTitleDraft(track.title || '');
                      setTitleEditing(false);
                    }}
                    disabled={titleSaving}
                  >
                    Cancel
                  </button>
                </div>
                <small id="creator-audio-title-help">Press Enter to save or Escape to cancel.</small>
              </div>
            ) : (
              <div className="creator-audio-title-display">
                <h2 id="creator-audio-modal-title">{titleDraft || 'Untitled Audio'}</h2>
                <button type="button" onClick={() => setTitleEditing(true)} aria-label="Rename audio">
                  <FaEdit /> Rename
                </button>
              </div>
            )}
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
                <button type="button" className="primary" onClick={togglePlayback} disabled={!fileUrl || streamLoading} aria-label={isPlaying ? 'Pause' : 'Play'}>
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

          {streamLoading && !error && (
            <div className="creator-audio-modal-error" role="status">Preparing protected playback...</div>
          )}
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
            Playback uses Echoo’s protected range stream. Downloads still use the exact stored original with no extra transcoding.
          </p>
        </div>
      </section>
    </div>
  );
};

export default CreatorAudioDetailModal;
