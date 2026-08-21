import {
  FaHeadphones,
  FaPause,
  FaPlay,
  FaRandom,
  FaRedoAlt,
  FaStepBackward,
  FaStepForward,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';

import EchoSignal from '../EchooSystem/EchoSignal';
import { Thumbnail } from './ImagePrimitives';
import './SharedPrimitives.css';

const formatTime = (seconds) => {
  const safe = Number.isFinite(Number(seconds)) ? Number(seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remaining = Math.floor(safe % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
};

const PlayerBar = ({
  audioRef,
  audioProps = {},
  currentTrack,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  volume = 1,
  isMuted = false,
  queue = [],
  shuffle = false,
  repeatMode = 'off',
  playerError = '',
  progressPercentage = 0,
  onTogglePlay,
  onPlayNext,
  onPlayPrevious,
  onSeek,
  onToggleShuffle,
  onToggleRepeat,
  onToggleMute,
  onVolumeChange,
}) => (
  <div className={`echoo-player-bar${playerError ? ' has-playback-error' : ''}`}>
    <audio ref={audioRef} preload="metadata" {...audioProps} />

    <div className="echoo-player-bar__track">
      <EchoSignal
        size="sm"
        active={isPlaying}
        className="echoo-player-bar__signal"
        label={isPlaying ? 'Echoo playback active' : 'Echoo playback signal'}
      />
      <div className="echoo-player-bar__art">
        {currentTrack?.coverArt ? <Thumbnail src={currentTrack.coverArt} alt="" /> : <FaHeadphones />}
      </div>
      <div className="echoo-player-bar__info">
        <strong>{currentTrack?.title || 'Choose something to play'}</strong>
        <span>{playerError || currentTrack?.subtitle || 'Echoo'}</span>
      </div>
    </div>

    <div className="echoo-player-bar__controls" aria-label="Playback controls">
      <button type="button" className={shuffle ? 'active' : ''} onClick={onToggleShuffle} disabled={!queue.length} aria-label="Shuffle"><FaRandom /></button>
      <button type="button" onClick={onPlayPrevious} disabled={!queue.length} aria-label="Previous"><FaStepBackward /></button>
      <button type="button" className="echoo-player-bar__play" onClick={onTogglePlay} disabled={!currentTrack?.fileUrl} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <FaPause /> : <FaPlay />}</button>
      <button type="button" onClick={onPlayNext} disabled={!queue.length} aria-label="Next"><FaStepForward /></button>
      <button type="button" className={repeatMode !== 'off' ? 'active' : ''} onClick={onToggleRepeat} disabled={!queue.length} aria-label={`Repeat ${repeatMode}`}><FaRedoAlt /></button>
    </div>

    <div className="echoo-player-bar__progress-wrap">
      <span>{formatTime(currentTime)}</span>
      <button
        type="button"
        className="echoo-player-bar__progress"
        onClick={(event) => {
          if (!duration) return;
          const rect = event.currentTarget.getBoundingClientRect();
          onSeek?.(((event.clientX - rect.left) / rect.width) * duration);
        }}
        aria-label="Audio progress"
        aria-valuemin="0"
        aria-valuemax={duration}
        aria-valuenow={currentTime}
      >
        <span style={{ width: `${progressPercentage}%` }} />
      </button>
      <span>{formatTime(duration)}</span>
      <button type="button" onClick={onToggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>{isMuted || volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}</button>
      <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={(event) => onVolumeChange?.(Number(event.target.value))} aria-label="Volume" />
    </div>
  </div>
);

export default PlayerBar;
