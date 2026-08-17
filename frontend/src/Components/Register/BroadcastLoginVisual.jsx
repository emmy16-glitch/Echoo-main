import { useEffect, useRef, useState } from "react";
import {
  FaBroadcastTower,
  FaMicrophone,
  FaSlidersH,
  FaWaveSquare,
} from "react-icons/fa";
import "./login-waveform-parity.css";

const BAR_COUNT = 44;

const stopStream = (stream) => {
  stream?.getTracks?.().forEach((track) => track.stop());
};

const BroadcastLoginVisual = ({ logoSrc }) => {
  const barRefs = useRef([]);
  const meterRefs = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(0);
  const [micState, setMicState] = useState("idle");
  const [message, setMessage] = useState(
    "Tap the mic to preview your microphone"
  );

  useEffect(() => {
    const frequencyData = new Uint8Array(128);

    const animate = (time) => {
      const analyser = analyserRef.current;

      if (analyser) {
        analyser.getByteFrequencyData(frequencyData);
      }

      barRefs.current.forEach((bar, index) => {
        if (!bar) return;

        let scale;
        let opacity;

        if (analyser) {
          const bucket = Math.min(
            frequencyData.length - 1,
            Math.floor((index / BAR_COUNT) * frequencyData.length)
          );
          const level = frequencyData[bucket] / 255;
          const neighbour =
            frequencyData[Math.min(bucket + 2, frequencyData.length - 1)] / 255;
          const energy = Math.min(1, level * 0.72 + neighbour * 0.28);
          scale = 0.48 + energy * 1.85;
          opacity = 0.48 + energy * 0.52;
        } else {
          const waveOne = Math.sin(time * 0.004 + index * 0.43);
          const waveTwo = Math.sin(time * 0.0027 - index * 0.19);
          const energy = 0.5 + waveOne * 0.28 + waveTwo * 0.16;
          scale = 0.68 + Math.abs(energy) * 0.58;
          opacity = 0.58 + Math.abs(waveOne) * 0.36;
        }

        bar.style.transform = `scaleY(${scale.toFixed(3)})`;
        bar.style.opacity = opacity.toFixed(3);
      });

      meterRefs.current.forEach((bar, index) => {
        if (!bar) return;
        const pulse = analyser
          ? Math.max(0.45, frequencyData[(index + 1) * 9] / 255)
          : 0.58 + Math.abs(Math.sin(time * 0.005 + index * 1.2)) * 0.5;
        bar.style.transform = `scaleY(${pulse.toFixed(3)})`;
      });

      rafRef.current = window.requestAnimationFrame(animate);
    };

    rafRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafRef.current);
      stopStream(streamRef.current);
      streamRef.current = null;
      analyserRef.current = null;
      audioContextRef.current?.close?.().catch?.(() => {});
      audioContextRef.current = null;
    };
  }, []);

  const disableMic = async () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    analyserRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setMicState("idle");
    setMessage("Tap the mic to preview your microphone");
  };

  const toggleMic = async () => {
    if (micState === "active") {
      await disableMic();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("unavailable");
      setMessage("Microphone unavailable — you can still sign in");
      return;
    }

    setMicState("requesting");
    setMessage("Requesting microphone…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        stopStream(stream);
        throw new Error("AudioContext unavailable");
      }

      const audioContext = new AudioContext();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      setMicState("active");
      setMessage("Mic active — audio stays on this device");
    } catch (error) {
      stopStream(streamRef.current);
      streamRef.current = null;
      analyserRef.current = null;
      audioContextRef.current?.close?.().catch?.(() => {});
      audioContextRef.current = null;
      setMicState(error?.name === "NotAllowedError" ? "denied" : "unavailable");
      setMessage(
        error?.name === "NotAllowedError"
          ? "Microphone permission was not granted"
          : "Microphone unavailable — you can still sign in"
      );
    }
  };

  const statusLabel =
    micState === "active"
      ? "MIC ACTIVE"
      : micState === "requesting"
      ? "REQUESTING"
      : micState === "denied"
      ? "MIC BLOCKED"
      : micState === "unavailable"
      ? "MIC UNAVAILABLE"
      : "MIC PREVIEW";

  return (
    <div className="echoo-broadcast-visual">
      <div className="echoo-broadcast-brand">
        <img src={logoSrc} alt="Echoo" />
        <span>Echoo</span>
      </div>

      <div className="echoo-broadcast-copy">
        <h1>
          Broadcast
          <br />
          your <span>voice.</span>
        </h1>
        <p>
          Go live. Share your message. Inspire your audience. {" "}
          All in one beautiful platform built for audio.
        </p>
      </div>

      <div className={`echoo-audio-preview is-${micState}`}>
        <div className="echoo-audio-preview-topline">
          <span className="echoo-audio-preview-status">
            <span className="echoo-audio-preview-dot" />
            {statusLabel}
          </span>

          <div className="echoo-audio-preview-meter" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                ref={(node) => {
                  meterRefs.current[index] = node;
                }}
              />
            ))}
          </div>
        </div>

        <div className="echoo-audio-preview-stage">
          <div className="echoo-login-wave-bars" aria-hidden="true">
            {Array.from({ length: BAR_COUNT }, (_, index) => (
              <span
                key={index}
                ref={(node) => {
                  barRefs.current[index] = node;
                }}
                style={{
                  "--bar": `${22 + ((index * 17) % 52)}%`,
                }}
              />
            ))}
          </div>

          <button
            type="button"
            className={`echoo-mic-preview-button ${
              micState === "active" ? "is-active" : ""
            }`}
            onClick={toggleMic}
            disabled={micState === "requesting"}
            aria-pressed={micState === "active"}
            aria-label={
              micState === "active"
                ? "Turn off microphone preview"
                : "Preview microphone"
            }
          >
            <span className="echoo-mic-preview-ring" aria-hidden="true" />
            <FaMicrophone aria-hidden="true" />
          </button>
        </div>

        <div className="echoo-audio-preview-controls" aria-hidden="true">
          <span className="echoo-audio-preview-control">
            <FaWaveSquare />
          </span>
          <span className="echoo-audio-preview-control echoo-broadcast-center-control">
            <FaBroadcastTower />
          </span>
          <span className="echoo-audio-preview-control">
            <FaSlidersH />
          </span>
        </div>

        <p
          className={`echoo-mic-preview-message is-${micState}`}
          aria-live="polite"
        >
          {message}
        </p>
      </div>
    </div>
  );
};

export default BroadcastLoginVisual;
