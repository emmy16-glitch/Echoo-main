import { useEffect, useRef, useState } from 'react';
import { FaCut, FaDownload, FaPlay, FaSave, FaStop } from 'react-icons/fa';
import { apiFetch } from '../../services/api.js';
import studioService from '../../services/studioService.js';
import {
  canTrimRecording,
  computePeaksAsync,
  decodeRecordingBlob,
  trimBufferToWavBlob,
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
  const [saveProgress, setSaveProgress] = useState(0);
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
    if (!id || saving || !bufferRef.current || !duration) return;
    stopPreview();
    try {
      setSaving(true);
      setSaveProgress(0);
      setError('');
      let uploadBlob = sourceBlobRef.current;
      let wasCut = false;
      if (!isFullLength) {
        const cut = trimBufferToWavBlob(bufferRef.current, start, selectionEnd);
        uploadBlob = cut.blob;
        wasCut = true;
      }
      const base = String(track?.title || 'Echoo recording').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'Echoo-recording';
      const file = new File([uploadBlob], `${base}${wasCut ? '-trimmed' : ''}.wav`, { type: 'audio/wav' });
      const response = await studioService.uploadAudioWithProgress({
        file,
        title: `${track?.title || 'Echoo recording'}${wasCut ? ' (trimmed)' : ''}`,
        description: track?.description || '',
        genre: track?.genre || 'Other',
        tags: Array.isArray(track?.tags) ? track.tags : [],
        isPublic: Boolean(track?.isPublic),
        timeoutMs: 120000,
        onProgress: ({ percent }) => setSaveProgress(percent || 0),
      });
      const newId = String(response?.data?.id || response?.data?._id || '');
      // Replace the original with the trimmed version.
      if (newId && newId !== id) {
        await studioService.deleteAudio(id).catch(() => {});
      }
      window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
      onNotice?.(`Trimmed version saved${wasCut ? '' : ' (full length)'}.`);
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
    if (!id && !master?.blob?.size) return;
    setPcSaving(true);
    setPcMessage('');
    try {
      let audioId = id;
      if (pcFormat === 'mp3' && id) {
        setMp3Ready(false);
        await waitForServerMp3(id, { attempts: 6, delayMs: 2500 }).catch(() => {});
        setMp3Ready(true);
      }
      const result = await saveRecordingToPc({
        blob: master?.blob || null,
        title: track?.title || 'Echoo recording',
        format: pcFormat,
        audioId,
      });
      setPcMessage(result?.cancelled ? 'Save cancelled.' : `${pcFormat.toUpperCase()} saved to your device. Saved successfully!`);
    } catch (deviceError) {
      setPcMessage(deviceError?.message || 'Could not save to this device.');
    } finally {
      setPcSaving(false);
    }
  };

  return (
    <div className="creator-audio-trim">
      <header className="creator-audio-trim-head">
        <strong><FaCut /> Trim & keep a copy</strong>
        <span>{sourceState === 'ready' && duration ? `${formatClock(start)} – ${formatClock(selectionEnd)} of ${formatClock(duration)}` : 'Crop anytime, save as MP3'}</span>
      </header>

      {sourceState === 'idle' && (
        <button type="button" className="creator-audio-trim-load" onClick={loadSource}>
          <FaCut /> {localMaster ? 'Trim this recording (instant)' : 'Load trimmer'}
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
          <label className="creator-audio-trim-slider">
            <span>Start <b>{formatClock(start)}</b></span>
            <input type="range" min={0} max={Math.max(1, Math.floor(duration))} step={1}
              value={Math.min(Math.floor(start), Math.floor(selectionEnd))} disabled={saving}
              onChange={(event) => { stopPreview(); setStart(Math.min(Number(event.target.value), selectionEnd)); }} />
          </label>
          <label className="creator-audio-trim-slider">
            <span>End <b>{formatClock(selectionEnd)}</b></span>
            <input type="range" min={0} max={Math.max(1, Math.floor(duration))} step={1}
              value={Math.floor(selectionEnd)} disabled={saving}
              onChange={(event) => { stopPreview(); setEnd(Math.max(Number(event.target.value), start)); }} />
          </label>
          <div className="creator-audio-trim-row">
            <button type="button" onClick={previewSelection} disabled={saving || previewing}>
              {previewing ? <FaStop /> : <FaPlay />} {previewing ? 'Playing…' : 'Preview'}
            </button>
            <span>{isFullLength ? 'Full recording' : `${formatClock(selectedSeconds)} selected`}</span>
          </div>
          <audio ref={previewAudioRef} preload="auto" onEnded={stopPreview} hidden />
          {saving && (
            <div className="creator-audio-trim-loading">
              <span>Uploading trimmed version… {saveProgress}%</span>
              <i><b style={{ width: `${Math.max(2, saveProgress)}%` }} /></i>
            </div>
          )}
          <button type="button" className="creator-audio-trim-save" onClick={saveTrimmed} disabled={saving}>
            <FaSave /> {saving ? `Saving… ${saveProgress}%` : isFullLength ? 'Save (replaces this recording)' : `Save trimmed (${formatClock(selectedSeconds)}) — replaces original`}
          </button>
        </>
      )}

      {error && <div className="creator-audio-modal-error" role="alert">{error}</div>}

      <div className="creator-audio-device">
        <strong>Save to this device</strong>
        <div className="creator-audio-device-formats" role="radiogroup" aria-label="Device save format">
          {RECORDING_PC_FORMATS.map((option) => (
            <label key={option.id} className={pcFormat === option.id ? 'is-selected' : ''}>
              <input type="radio" name={`echoo-device-format-${trackId}`} value={option.id}
                checked={pcFormat === option.id}
                onChange={() => { setPcFormat(option.id); setPcMessage(''); }} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={saveToDevice} disabled={pcSaving}>
          <FaDownload /> {pcSaving ? 'Saving…' : !mp3Ready && pcFormat === 'mp3' ? 'Preparing MP3…' : `Save ${pcFormat.toUpperCase()} to device`}
        </button>
        {pcMessage && <span className="creator-audio-device-message">{pcMessage}</span>}
        {!localMaster && <small>Opus/WAV use the instant local master when this take was just recorded; otherwise the server file is used.</small>}
      </div>
    </div>
  );
};

export default CreatorAudioTrimSection;
