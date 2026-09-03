import { useEffect, useRef, useState } from 'react';
import './ListenerLiveWaveform.css';

const SAMPLE_COUNT = 72;
const SAMPLE_INTERVAL_MS = 82;

const clampLevel = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const ListenerLiveWaveform = ({ level = 0, active = false }) => {
  const levelRef = useRef(clampLevel(level));
  const activeRef = useRef(Boolean(active));
  const [history, setHistory] = useState(() => Array(SAMPLE_COUNT).fill(0));

  useEffect(() => {
    levelRef.current = clampLevel(level);
  }, [level]);

  useEffect(() => {
    activeRef.current = Boolean(active);
  }, [active]);

  useEffect(() => {
    const sample = () => {
      const next = activeRef.current ? levelRef.current : 0;
      setHistory((current) => [...current.slice(1), next]);
    };

    sample();
    const interval = window.setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const hasSignal = active && history.some((sample) => sample > 0.018);

  return (
    <div
      className={`listener-live-waveform ${hasSignal ? 'has-signal' : 'is-quiet'}`}
      role="img"
      aria-label={hasSignal ? 'Live broadcast audio is active' : 'Live broadcast audio is quiet'}
    >
      <div className="listener-live-waveform-bars" aria-hidden="true">
        {history.map((sample, index) => {
          const normalized = clampLevel(sample);
          const height = normalized > 0.012
            ? Math.max(7, Math.round(10 + (normalized * 96)))
            : 4;
          const opacity = normalized > 0.012
            ? Math.min(1, 0.38 + (normalized * 0.82))
            : 0.18;
          return (
            <span
              key={index}
              style={{
                '--listener-wave-height': `${height}px`,
                '--listener-wave-opacity': opacity,
              }}
            />
          );
        })}
      </div>
      <i className="listener-live-waveform-baseline" aria-hidden="true" />
    </div>
  );
};

export default ListenerLiveWaveform;
