import { useEffect, useRef, useState } from "react";
import { FaMicrophone, FaShieldAlt, FaSignal, FaUser } from "react-icons/fa";
import microphoneAudience from "../Assets/echoo-auth-microphone-audience.png";

const BAR_COUNT = 38;
const LEVEL_COUNT = 24;

const stopStream = (stream) => {
  stream?.getTracks?.().forEach((track) => track.stop());
};

const EchooBrand = ({ logoSrc }) => (
  <div className="ear-brand" aria-label="Echoo">
    <img src={logoSrc} alt="" aria-hidden="true" />
    <strong>Echoo</strong>
  </div>
);

const AudioPreview = () => {
  const barRefs = useRef([]);
  const levelRefs = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(0);
  const [micState, setMicState] = useState("idle");
  const [message, setMessage] = useState("Start microphone test");

  useEffect(() => {
    const frequencyData = new Uint8Array(128);

    const animate = (time = 0) => {
      const analyser = analyserRef.current;
      if (analyser) analyser.getByteFrequencyData(frequencyData);

      barRefs.current.forEach((bar, index) => {
        if (!bar) return;
        const idleEnergy =
          0.55 +
          Math.abs(Math.sin(time * 0.0035 + index * 0.5)) * 0.48 +
          Math.abs(Math.sin(time * 0.0018 - index * 0.23)) * 0.2;
        const bucket = Math.min(
          frequencyData.length - 1,
          Math.floor((index / BAR_COUNT) * frequencyData.length)
        );
        const liveEnergy = analyser ? 0.44 + (frequencyData[bucket] / 255) * 1.75 : idleEnergy;
        bar.style.transform = `scaleY(${liveEnergy.toFixed(3)})`;
        bar.style.opacity = `${Math.min(1, 0.45 + liveEnergy * 0.35)}`;
      });

      levelRefs.current.forEach((level, index) => {
        if (!level) return;
        const isFilled = analyser
          ? frequencyData[Math.min(frequencyData.length - 1, index * 4)] > 36
          : index < 17;
        level.classList.toggle("is-filled", isFilled);
      });

      rafRef.current = window.requestAnimationFrame(animate);
    };

    rafRef.current = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(rafRef.current);
      stopStream(streamRef.current);
      audioContextRef.current?.close?.().catch?.(() => {});
    };
  }, []);

  const turnOffMic = async () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    analyserRef.current = null;
    await audioContextRef.current?.close?.().catch?.(() => {});
    audioContextRef.current = null;
    setMicState("idle");
    setMessage("Start microphone test");
  };

  const toggleMic = async () => {
    if (micState === "active") {
      await turnOffMic();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("unavailable");
      setMessage("Microphone preview unavailable");
      return;
    }

    setMicState("requesting");
    setMessage("Requesting microphone access…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error("AudioContext unavailable");
      const context = new AudioContext();
      if (context.state === "suspended") await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      context.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;
      setMicState("active");
      setMessage("Listening — audio stays on this device");
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
          : "Microphone preview unavailable"
      );
    }
  };

  const statusLabel =
    micState === "active"
      ? "LIVE AUDIO"
      : micState === "requesting"
      ? "CONNECTING"
      : micState === "denied"
      ? "MIC BLOCKED"
      : micState === "unavailable"
      ? "MIC UNAVAILABLE"
      : "LIVE AUDIO CHECK";

  return (
    <div className={`ear-audio-card is-${micState}`}>
      <div className="ear-audio-topline">
        <span className="ear-audio-status"><i /> {statusLabel}</span>
        <span className="ear-signal" aria-hidden="true"><FaSignal /></span>
      </div>

      <div className="ear-wave-stage">
        <div className="ear-waveform" aria-hidden="true">
          {Array.from({ length: BAR_COUNT }, (_, index) => (
            <span
              key={index}
              ref={(node) => { barRefs.current[index] = node; }}
              style={{ "--bar-height": `${22 + ((index * 19) % 52)}%` }}
            />
          ))}
        </div>
        <button
          type="button"
          className={`ear-mic-button ${micState === "active" ? "is-active" : ""}`}
          onClick={toggleMic}
          disabled={micState === "requesting"}
          aria-pressed={micState === "active"}
          aria-label={micState === "active" ? "Stop microphone test" : "Start microphone test"}
        >
          <span aria-hidden="true" />
          <FaMicrophone aria-hidden="true" />
        </button>
      </div>

      <p className="ear-mic-message" aria-live="polite">{message}</p>
      <div className="ear-level-row" aria-hidden="true">
        <span>Input level</span>
        <div className="ear-level-meter">
          {Array.from({ length: LEVEL_COUNT }, (_, index) => (
            <i key={index} ref={(node) => { levelRefs.current[index] = node; }} />
          ))}
        </div>
        <strong>72%</strong>
      </div>
    </div>
  );
};

const LoginArtwork = () => (
  <div className="ear-login-art" aria-hidden="true">
    <img src={microphoneAudience} alt="" />
    <div className="ear-social-proof ear-proof-live">
      <span><FaUser /></span>
      <p><strong>Sarah just went live</strong><small>2.4K listening</small></p>
    </div>
    <div className="ear-social-proof ear-proof-show">
      <span><FaMicrophone /></span>
      <p><strong>Your show hit</strong><small>1K listeners!</small></p>
    </div>
    <div className="ear-social-proof ear-proof-message">
      <span><FaUser /></span>
      <p><strong>New message</strong><small>From Alex</small></p>
    </div>
  </div>
);

const BroadcastLoginVisual = ({ logoSrc, mode = "signup" }) => {
  const isLogin = mode === "login";

  return (
    <div className={`ear-story ${isLogin ? "is-login" : "is-signup"}`}>
      <EchooBrand logoSrc={logoSrc} />
      <div className="ear-story-copy">
        {isLogin ? (
          <>
            <h1>Welcome back<br />to <em>Echoo.</em></h1>
            <p>Your audience is waiting.</p>
          </>
        ) : (
          <>
            <h1>Your <em>voice.</em><br />Your audience.<br />Your moment.</h1>
            <p>Go live, connect with listeners, and<br className="ear-desktop-break" /> turn conversations into experiences.</p>
          </>
        )}
      </div>
      {isLogin ? <LoginArtwork /> : <AudioPreview />}
      {!isLogin && (
        <p className="ear-security-note"><FaShieldAlt aria-hidden="true" /> Secure. Private. Built for creators.</p>
      )}
    </div>
  );
};

export { EchooBrand };
export default BroadcastLoginVisual;
