import { useEffect, useRef, useState } from 'react';
import { FaCut, FaDownload, FaPlay, FaSave, FaStop } from 'react-icons/fa';
import { apiFetch } from '../../services/api.js';
import {
  canTrimRecording,
  computePeaksAsync,
  decodeRecordingBlob,
  trimSavedAudio,
} from '../../services/audioTrimService.js';
import {
  RECORDING_PC_FORMATS,
  saveRecordingToPc,
  waitForServerMp3,
} from '../../services/recordingExportService.js';
import { peekLocalMaster } from '../../services/recordingAutosave.js';
import './CreatorAudioDetailModal.css';

const getId = (track) => String(track?.id || track?._id || '');

const formatClock = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
};

const CreatorAudioTrimSection = ({ track, onChanged, onClose, onNotice }) => {
  const trackId = getId(track);
  const [sourceState, setSourceState] = useState('idle'); // idle|loading|ready|error
  const [sourceLabel, setSourceLabel] = useState('');
  const [progress, setProgress] = useState(0);
  const [peaks, setPeaks] = useState([]);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pcFormat, setPcFormat] = useState('mp3');
  const [pcSaving, setPcSaving] = useState(false);
  const [pcMessage, setPcMessage] = useState('');
  const [mp3Ready, setMp3Ready] = useState(true);
  const bufferRef = useRef(null);
  const sourceBlobRef = useRef(null);
  const previewAudioRef = useRef(null);
  const previewUrlRef = useRef('');
  const previewTimerRef = useRef(null);

  const localMaster = peekLocalMaster(trackId);
  const localMasterMime = String(localMaster?.mimeType || localMaster?.blob?.type || '').toLowerCase();
  const availableFormats = RECORDING_PC_FORMATS.filter((option) => {
    if (option.id === 'mp3') return Boolean(trackId);
    if (!localMaster?.blob?.size) return false;
    if (option.id === 'wav') return localMasterMime.includes('wav');
    if (option.id === 'opus') {
      return localMasterMime.includes('opus') || localMasterMime.includes('ogg') || localMasterMime.includes('webm');
    }
    return false;
  });
  const selectedFormat = availableFormats.find((option) => option.id === pcFormat) || availableFormats[0] || null;

  useEffect(() => () => {
    window.clearTimeout(previewTimerRef.current);
    try { previewAudioRef.current?.pause(); } catch { /* noop */ }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const stopPreview = () => {
    window.clearTimeout(previewTimerRef.current);
    try { previewAudioRef.current?.pause(); } catch { /* noop */ }
    setPreviewing(false);
  };

  const loadSource = async () => {
    const id = getId(track);
    if (!id || sourceState === 'loading') return;
    try {
      setError('');
      setSourceState('loading');
      setProgress(2);
      let blob = peekLocalMaster(id)?.blob || null;
      let label = 'local master';
      if (!blob?.size) {
        setSourceLabel('Downloading server copy…');
        const response = await apiFetch(`/audio/${encodeURIComponent(id)}/download`);
        if (!response.ok) throw new Error('Could not fetch this recording for trimming.');
        blob = await response.blob();
        label = 'server copy';
      }
      if (!canTrimRecording(blob)) {
        throw new Error('This recording is too long to trim in the browser.');
      }
      sourceBlobRef.current = blob;
      setSourceLabel(label);
      const buffer = await decodeRecordingBlob(blob, (value) => setProgress(Math.min(70, value * 0.7)));
      bufferRef.current = buffer;
      const computed = await computePeaksAsync(buffer, 120, (value) => setProgress(70 + Math.round(value * 0.3)));
      setPeaks(computed);
      setDuration(buffer.duration || 0);
      setStart(0);
      setEnd(buffer.duration || 0);
      setProgress(100);
      setSourceState('ready');
    } catch (loadError) {
      setError(loadError?.message || 'Could not prepare trimming for this recording.');
      setSourceState('error');
    }
  };

  const previewSelection = () => {
    const blob = sourceBlobRef.current;
    if (!blob?.size || !duration) return;
    stopPreview();
    if (!previewUrlRef.current) previewUrlRef.current = URL.createObjectURL(blob);
    const audio = previewAudioRef.current;
    if (!audio) return;
    const selectionEnd = end > start ? end : duration;
    try {
      audio.src = previewUrlRef.current;
      audio.currentTime = Math.max(0, start);
      void audio.play();
      setPreviewing(true);
      previewTimerRef.current = window.setTimeout(stopPreview, Math.max(500, (selectionEnd - start) * 1000));
    } catch {
      setPreviewing(false);
    }
  };

  const selectionEnd = end > start ? end : duration;
  const isFullLength = duration > 0 && selectionEnd - start >= duration - 0.5 && start <= 0.5;
  const selectedSeconds = Math.max(0, selectionEnd - start);

  const saveTrimmed = async () => {
    const id = getId(track);
    if (!id || saving || !duration || isFullLength) return;
    stopPreview();
    try {
      setSaving(true);
      setError('');

      // The browser sends only timestamps. FFmpeg trims the already-saved
      // server recording and creates a separate private copy, so long shows
      // never become another giant WAV upload and the original is untouched.
      const response = await trimSavedAudio(id, {
        startSeconds: start,
        endSeconds: selectionEnd,
        duration,
      });

      window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
      onNotice?.('Trimmed copy saved to Recordings. The original is unchanged.');
      onChanged?.(response?.data);
      onClose?.();
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the trimmed version.');
      setSaving(false);
    }
  };

  const saveToDevice = async () => {
    const id = getId(track);
    const master = peekLocalMaster(id);
    if ((!id && !master?.blob?.size) || !selectedFormat) return;
    setPcSaving(true);
    setPcMessage('');
    try {
      let audioId = id;
      if (selectedFormat.id === 'mp3' && id) {
        setMp3Ready(false);
        await waitForServerMp3(id, { attempts: 6, delayMs: 2500 }).catch(() => {});
        setMp3Ready(true);
      }
      const result = await saveRecordingToPc({
        blob: master?.blob || null,
        title: track?.title || 'Echoo recording',
        format: selectedFormat.id,
        audioId,
        channelName:
          track?.sourceBroadcast?.station?.name ||
          track?.station?.name ||
          track?.channelName ||
          '',
        startedAt:
          track?.sourceBroadcast?.startedAt ||
          track?.startedAt ||
          track?.createdAt ||
          null,
      });
      const savedLabel = selectedFormat.id === 'opus' && localMasterMime.includes('webm')
        ? 'WebM / Opus'
        : selectedFormat.label;
      setPcMessage(result?.cancelled ? 'Save cancelled.' : `${savedLabel} saved to your device.`);
    } catch (deviceError) {
      setPcMessage(deviceError?.message || 'Could not save to this device.');
    } finally {
      setPcSaving(false);
    }
  };

  return (
    <div className="creator-audio-trim">
      <section className="creator-audio-trim-card" aria-labelledby={`creator-audio-trim-title-${trackId}`}>
        <header className="creator-audio-trim-head">
          <div>
            <strong id={`creator-audio-trim-title-${trackId}`}><FaCut /> Trim recording</strong>
            <span>
              {sourceState === 'ready' && duration
                ? 'Choose the part you want to keep. Echoo trims the saved server copy without changing the original.'
                : 'Create a separate trimmed copy. No large WAV upload is required.'}
            </span>
          </div>
          {sourceState === 'ready' && duration > 0 && (
            <span className="creator-audio-trim-selection">
              {formatClock(start)} – {formatClock(selectionEnd)} of {formatClock(duration)}
            </span>
          )}
        </header>

        {sourceState === 'idle' && (
          <button type="button" className="creator-audio-trim-load eb-press" onClick={loadSource}>
            <FaCut /> {localMaster ? 'Open trimmer' : 'Load trimmer'}
          </button>
        )}

        {sourceState === 'loading' && (
          <div className="creator-audio-trim-loading">
            <span>Preparing waveform… {progress}% ({sourceLabel})</span>
            <i><b style={{ width: `${Math.max(2, progress)}%` }} /></i>
          </div>
        )}

        {sourceState === 'ready' && (
          <>
            <div className="creator-audio-trim-wave" role="img" aria-label="Recording waveform">
              {peaks.map((peak, index) => {
                const pos = peaks.length <= 1 ? 0 : index / (peaks.length - 1);
                const time = pos * duration;
                const selected = time >= start && time <= selectionEnd;
                return <i key={index} style={{ height: `${Math.max(4, Math.round(peak * 100))}%` }} className={selected ? 'is-selected' : 'is-cut'} />;
              })}
            </div>

            <div className="creator-audio-trim-range-grid">
              <label className="creator-audio-trim-slider">
                <span>Start <b>{formatClock(start)}</b></span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.floor(duration))}
                  step={1}
                  value={Math.min(Math.floor(start), Math.floor(selectionEnd))}
                  disabled={saving}
                  onChange={(event) => {
                    stopPreview();
                    setStart(Math.min(Number(event.target.value), selectionEnd));
                  }}
                />
              </label>
              <label className="creator-audio-trim-slider">
                <span>End <b>{formatClock(selectionEnd)}</b></span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.floor(duration))}
                  step={1}
                  value={Math.floor(selectionEnd)}
                  disabled={saving}
                  onChange={(event) => {
                    stopPreview();
                    setEnd(Math.max(Number(event.target.value), start));
                  }}
                />
              </label>
            </div>

            <div className="creator-audio-trim-row">
              <button type="button" onClick={previewSelection} disabled={saving || previewing}>
                {previewing ? <FaStop /> : <FaPlay />} {previewing ? 'Playing…' : 'Preview selection'}
              </button>
              <span>{isFullLength ? 'Full recording selected' : `${formatClock(selectedSeconds)} selected`}</span>
            </div>

            <audio ref={previewAudioRef} preload="auto" onEnded={stopPreview} hidden />

            {saving && (
              <div className="creator-audio-trim-loading" role="status">
                <span>Creating trimmed copy on the Echoo server…</span>
                <i><b style={{ width: '72%' }} /></i>
              </div>
            )}

            <button
              type="button"
              className="creator-audio-trim-save eb-press"
              onClick={saveTrimmed}
              disabled={saving || isFullLength}
            >
              <FaSave />
              {saving
                ? 'Saving trimmed copy…'
                : isFullLength
                  ? 'Adjust the trim range to save a copy'
                  : `Save trimmed copy (${formatClock(selectedSeconds)})`}
            </button>
          </>
        )}

        {error && <div className="creator-audio-modal-error" role="alert">{error}</div>}
      </section>

      <section className="creator-audio-device" aria-labelledby={`creator-audio-export-title-${trackId}`}>
        <div className="creator-audio-device-copy">
          <strong id={`creator-audio-export-title-${trackId}`}>Export to this device</strong>
          <span>Create a separate file for sharing or editing. Your Echoo recording stays unchanged.</span>
        </div>

        <div className="creator-audio-device-formats" role="radiogroup" aria-label="Export format">
          {availableFormats.map((option) => {
            const displayLabel = option.id === 'opus' && localMasterMime.includes('webm')
              ? 'WebM / Opus'
              : option.label;
            return (
              <label key={option.id} className={pcFormat === option.id ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name={`echoo-device-format-${trackId}`}
                  value={option.id}
                  checked={selectedFormat?.id === option.id}
                  onChange={() => {
                    setPcFormat(option.id);
                    setPcMessage('');
                  }}
                />
                <span>{displayLabel}</span>
                <small>{option.hint}</small>
              </label>
            );
          })}
        </div>

        {selectedFormat ? (
          <button type="button" className="creator-audio-device-save" onClick={saveToDevice} disabled={pcSaving}>
            <FaDownload />
            {pcSaving
              ? 'Saving…'
              : !mp3Ready && selectedFormat.id === 'mp3'
                ? 'Preparing MP3…'
                : `Save ${selectedFormat.id === 'opus' && localMasterMime.includes('webm') ? 'WebM / Opus' : selectedFormat.label}`}
          </button>
        ) : (
          <div className="creator-audio-device-unavailable" role="status">
            No export format is available for this recording yet.
          </div>
        )}

        {pcMessage && <span className="creator-audio-device-message" role="status">{pcMessage}</span>}

        <small className="creator-audio-device-help">
          {localMaster?.blob?.size
            ? 'Lossless or compressed master formats are available only while this device still has the local master.'
            : 'This device no longer has the local master, so Echoo can export the stored MP3 copy only.'}
        </small>
      </section>
    </div>
  );
};

export default CreatorAudioTrimSection;
