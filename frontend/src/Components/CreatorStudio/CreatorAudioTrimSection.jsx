import { useEffect, useRef, useState } from 'react';
import { FaCut, FaDownload, FaPlay, FaSave, FaStop } from 'react-icons/fa';
import {
  prepareTrimWaveform,
  trimSavedAudio,
} from '../../services/audioTrimService.js';
import {
  RECORDING_PC_FORMATS,
  saveRecordingToPc,
  waitForServerMp3,
} from '../../services/recordingExportService.js';
import { peekLocalMaster } from '../../services/recordingAutosave.js';
import studioService from '../../services/studioService.js';
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

const CreatorAudioTrimSection = ({ track, onChanged, onNotice, onOpenTrimmed }) => {
  const trackId = getId(track);
  const [sourceState, setSourceState] = useState('idle'); // idle|loading|ready|error
  const [sourceLabel, setSourceLabel] = useState('');
  const [peaks, setPeaks] = useState([]);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTrimmed, setSavedTrimmed] = useState(null);
  const [trimmedDownloading, setTrimmedDownloading] = useState(false);
  const [trimmedDownloadMessage, setTrimmedDownloadMessage] = useState('');
  const [error, setError] = useState('');
  const [pcFormat, setPcFormat] = useState('mp3');
  const [pcSaving, setPcSaving] = useState(false);
  const [pcMessage, setPcMessage] = useState('');
  const [mp3Ready, setMp3Ready] = useState(true);
  const waveformAbortRef = useRef(null);
  const previewAudioRef = useRef(null);
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
    waveformAbortRef.current?.abort();
    window.clearTimeout(previewTimerRef.current);
    try { previewAudioRef.current?.pause(); } catch { /* noop */ }
  }, []);

  const stopPreview = () => {
    window.clearTimeout(previewTimerRef.current);
    try { previewAudioRef.current?.pause(); } catch { /* noop */ }
    setPreviewing(false);
  };

  const loadSource = async () => {
    const id = getId(track);
    if (!id || sourceState === 'loading') return;

    waveformAbortRef.current?.abort();
    const controller = new AbortController();
    waveformAbortRef.current = controller;

    try {
      setError('');
      setSourceState('loading');
      setSourceLabel('Preparing waveform on Echoo…');

      const waveform = await prepareTrimWaveform(id, {
        signal: controller.signal,
        onStatus: ({ attempt }) => {
          setSourceLabel(
            attempt > 2
              ? 'Preparing this long recording on Echoo…'
              : 'Preparing waveform on Echoo…'
          );
        },
      });

      if (controller.signal.aborted) return;
      setPeaks(waveform.points);
      setDuration(waveform.duration);
      setStart(0);
      setEnd(waveform.duration);
      setSourceLabel(waveform.cached ? 'Waveform ready' : 'Waveform prepared');
      setSourceState('ready');
    } catch (loadError) {
      if (loadError?.code === 'ABORT_ERR' || controller.signal.aborted) return;
      setError(loadError?.message || 'Could not prepare trimming for this recording.');
      setSourceState('error');
    } finally {
      if (waveformAbortRef.current === controller) waveformAbortRef.current = null;
    }
  };

  const previewSelection = async () => {
    const id = getId(track);
    if (!id || !duration || previewing) return;

    stopPreview();
    setError('');
    const audio = previewAudioRef.current;
    if (!audio) return;

    try {
      const stream = await studioService.getAudioStreamUrl(id);
      if (!stream?.streamUrl) throw new Error('Echoo could not prepare streaming preview.');

      audio.src = stream.streamUrl;
      audio.preload = 'metadata';
      audio.load();

      if (audio.readyState < 1) {
        await new Promise((resolve, reject) => {
          const timer = window.setTimeout(
            () => reject(new Error('Preview took too long to start.')),
            12_000
          );
          const cleanup = () => {
            window.clearTimeout(timer);
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('error', onError);
          };
          const onReady = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error('Echoo could not stream this recording for preview.'));
          };
          audio.addEventListener('loadedmetadata', onReady, { once: true });
          audio.addEventListener('error', onError, { once: true });
        });
      }

      const selectionEnd = end > start ? end : duration;
      audio.currentTime = Math.max(0, start);
      await audio.play();
      setPreviewing(true);
      previewTimerRef.current = window.setTimeout(
        stopPreview,
        Math.max(500, (selectionEnd - start) * 1000)
      );
    } catch (previewError) {
      setPreviewing(false);
      setError(previewError?.message || 'Could not preview this selection.');
    }
  };

  const selectionEnd = end > start ? end : duration;
    try {
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
      setTrimmedDownloadMessage('');
      setSavedTrimmed(null);

      // The browser sends only timestamps. FFmpeg trims the already-saved
      // server recording and creates a separate private copy, so long shows
      // never become another giant WAV upload and the original is untouched.
      const response = await trimSavedAudio(id, {
        startSeconds: start,
        endSeconds: selectionEnd,
        duration,
      });
      const trimmed = response?.data || null;
      if (!getId(trimmed)) {
        throw new Error('Echoo created the trim but did not return its saved recording.');
      }

      setSavedTrimmed(trimmed);
      window.dispatchEvent(new CustomEvent('echoo:creator-audio-changed'));
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
      onNotice?.('Trimmed copy saved. You can download it now; the original is unchanged.');
      onChanged?.(trimmed);
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the trimmed version.');
    } finally {
      setSaving(false);
    }
  };

  const downloadTrimmed = async () => {
    const trimmedId = getId(savedTrimmed);
    if (!trimmedId || trimmedDownloading) return;
    try {
      setTrimmedDownloading(true);
      setTrimmedDownloadMessage('');
      setError('');
      await studioService.downloadAudio(trimmedId, {
        title: savedTrimmed?.title || `${track?.title || 'Echoo recording'} (trimmed)`,
        originalName: savedTrimmed?.originalName,
        mimeType: savedTrimmed?.mimeType,
      });
      setTrimmedDownloadMessage('Trimmed recording downloaded.');
    } catch (downloadError) {
      setError(downloadError?.message || 'Could not download the trimmed recording.');
    } finally {
      setTrimmedDownloading(false);
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
                ? 'Adjust the start and end points.'
                : 'Keep only the part you need.'}
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
          <div className="creator-audio-trim-loading" role="status">
            <span>{sourceLabel || 'Preparing waveform on Echoo…'}</span>
            <i className="is-indeterminate"><b /></i>
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
                    setSavedTrimmed(null);
                    setTrimmedDownloadMessage('');
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
                    setSavedTrimmed(null);
                    setTrimmedDownloadMessage('');
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

            <audio ref={previewAudioRef} preload="metadata" onEnded={stopPreview} hidden />

            {saving && (
              <div className="creator-audio-trim-loading" role="status">
                <span>Creating your trimmed copy…</span>
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

            {savedTrimmed && (
              <div className="creator-audio-trim-result" role="status" aria-live="polite">
                <div>
                  <strong>Trimmed copy saved</strong>
                  <span>
                    {savedTrimmed.title || `${track?.title || 'Recording'} (trimmed)`}
                    {' · '}
                    {formatClock(savedTrimmed.duration || selectedSeconds)}
                  </span>
                </div>
                <div className="creator-audio-trim-result-actions">
                  <button
                    type="button"
                    className="creator-audio-trim-download eb-press"
                    onClick={downloadTrimmed}
                    disabled={trimmedDownloading}
                  >
                    <FaDownload />
                    {trimmedDownloading ? 'Downloading…' : 'Download trimmed version'}
                  </button>
                  {onOpenTrimmed && (
                    <button
                      type="button"
                      className="creator-audio-trim-open eb-press"
                      onClick={() => onOpenTrimmed(getId(savedTrimmed))}
                    >
                      Open trimmed recording
                    </button>
                  )}
                </div>
                {trimmedDownloadMessage && <small>{trimmedDownloadMessage}</small>}
              </div>
            )}
          </>
        )}

        {error && <div className="creator-audio-modal-error" role="alert">{error}</div>}
      </section>

      <section className="creator-audio-device" aria-labelledby={`creator-audio-export-title-${trackId}`}>
        <div className="creator-audio-device-copy">
          <strong id={`creator-audio-export-title-${trackId}`}>Export</strong>
          <span>Save a copy on this device.</span>
        </div>

        {availableFormats.length > 1 ? (
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
        ) : selectedFormat ? (
          <div className="creator-audio-device-format-single" aria-label="Export format">
            <span>{selectedFormat.id === 'opus' && localMasterMime.includes('webm') ? 'WebM / Opus' : selectedFormat.label}</span>
            <small>{selectedFormat.hint}</small>
          </div>
        ) : null}

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

      </section>
    </div>
  );
};

export default CreatorAudioTrimSection;

