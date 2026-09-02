import { useEffect, useRef } from 'react';

const BAR_COUNT = 56;

/**
 * A deliberately lightweight visualiser. It remains gently active before a
 * source is connected, then takes its energy from the canonical mixer state.
 * Canvas avoids turning audio-frame updates into React renders.
 */
export default function BroadcastWaveform({ live = false, level = 0, analyser = null }) {
  const canvasRef = useRef(null);
  const levelRef = useRef(level);
  const analyserRef = useRef(analyser);

  useEffect(() => {
    levelRef.current = Number(level) || 0;
  }, [level]);

  useEffect(() => {
    analyserRef.current = analyser;
  }, [analyser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const color = live ? '#f15454' : '#1263ff';
    let animationFrame = 0;

    // Create a typed array once if an analyser is present. We will re-create it if the analyser changes.
    let dataArray = null;

    const render = (timestamp = 0) => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(bounds.width * ratio));
      const height = Math.max(1, Math.floor(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.strokeStyle = color;
      context.lineCap = 'round';

      let currentLevel = levelRef.current;
      const currentAnalyser = analyserRef.current;
      if (currentAnalyser) {
        if (!dataArray || dataArray.length !== currentAnalyser.frequencyBinCount) {
          dataArray = new Uint8Array(currentAnalyser.frequencyBinCount);
        }
        currentAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        currentLevel = (sum / dataArray.length) / 255;
      }

      const baseEnergy = Math.min(1, Math.max(0, currentLevel));
      const time = reducedMotion ? 0 : timestamp / 1000;
      const waveformWidth = bounds.width * .82;
      const waveformStart = (bounds.width - waveformWidth) / 2;
      const spacing = waveformWidth / BAR_COUNT;
      const center = bounds.height / 2;

      // The reference has a soft dotted lead-in/out rather than bars running
      // directly into the edges. It also keeps the generated waveform legible
      // when no analyser source is connected.
      context.globalAlpha = .8;
      context.fillStyle = color;
      for (const direction of [-1, 1]) {
        for (let dot = 0; dot < 7; dot += 1) {
          const x = direction < 0
            ? waveformStart - (dot + 1) * 7
            : waveformStart + waveformWidth + (dot + 1) * 7;
          context.beginPath();
          context.arc(x, center, dot < 2 ? 2.1 : 1.5, 0, Math.PI * 2);
          context.fill();
        }
      }

      for (let index = 0; index < BAR_COUNT; index += 1) {
        const position = index / (BAR_COUNT - 1);
        // Match the source's asymmetric cluster rhythm: a moderate early
        // burst, a dominant middle peak, then a second late peak.
        const envelope = [
          [0.14, 0.26, 0.05],
          [0.30, 0.53, 0.07],
          [0.48, 0.35, 0.05],
          [0.58, 0.88, 0.07],
          [0.77, 0.63, 0.075],
        ].reduce((total, [centerPoint, height, spread]) => (
          total + height * Math.exp(-Math.pow((position - centerPoint) / spread, 2))
        ), 0.04);
        const organic = 0.82 + 0.13 * Math.sin(index * 1.73 + time * 2.1) + 0.07 * Math.sin(index * .43 - time * 1.25);
        const audioEnergy = baseEnergy * (0.45 + 0.55 * Math.sin(index * 1.19 + time * 5.5) ** 2);

        // When using an analyser, scale down the artificial organic movement based on actual audio energy to reflect silence
        const idleFactor = currentAnalyser ? Math.min(1, baseEnergy * 8) : 1;
        const amplitude = Math.min(0.94, (idleFactor * (0.08 + envelope * organic)) + (audioEnergy * 1.2));

        const barHeight = Math.max(3, amplitude * bounds.height);
        const x = waveformStart + index * spacing + spacing / 2;
        context.globalAlpha = 0.62 + Math.min(envelope, 1) * 0.38;
        context.lineWidth = index % 3 === 0 ? 3 : 2;
        context.beginPath();
        context.moveTo(x, center - barHeight / 2);
        context.lineTo(x, center + barHeight / 2);
        context.stroke();
      }
      context.globalAlpha = 1;
      if (!reducedMotion) animationFrame = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [live]);

  return <canvas ref={canvasRef} className="ec2-waveform" aria-label={live ? 'Live audio waveform' : 'Off air audio waveform'} />;
}
