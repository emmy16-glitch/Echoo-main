import { useEffect, useRef, useState } from "react";
import {
  FaBroadcastTower,
  FaCheck,
  FaHeart,
  FaMicrophone,
  FaSlidersH,
  FaUserFriends,
} from "react-icons/fa";
import echooLogo from "../Assets/echoo-brand-logo.png";
import "./onboarding-redesign.css";
import "./onboarding-animation-fix.css";
import "./onboarding-layout-audit.css";

const BASIC_STEPS = ["Account", "Profile", "Role"];
const AUDIO_BAR_COUNT = 44;
const PROFILE_BAR_COUNT = 24;

const stopMediaStream = (stream) => {
  stream?.getTracks?.().forEach((track) => track.stop());
};

const AudioHero = () => {
  const barRefs = useRef([]);
  const meterRefs = useRef([]);
  const rafRef = useRef(0);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const [micState, setMicState] = useState("idle");
  const [message, setMessage] = useState(
    "Tap the microphone to preview your audio"
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
            Math.floor((index / AUDIO_BAR_COUNT) * frequencyData.length)
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
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      analyserRef.current = null;
      audioContextRef.current?.close?.().catch?.(() => {});
      audioContextRef.current = null;
    };
  }, []);

  const disableMic = async () => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    analyserRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setMicState("idle");
    setMessage("Tap the microphone to preview your audio");
  };

  const toggleMic = async () => {
    if (micState === "active") {
      await disableMic();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("unavailable");
      setMessage("Microphone preview is unavailable on this browser");
      return;
    }

    setMicState("requesting");
    setMessage("Requesting microphone access…");

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
        stopMediaStream(stream);
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
      setMessage("Mic preview active — audio stays on this device");
    } catch (error) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      analyserRef.current = null;
      audioContextRef.current?.close?.().catch?.(() => {});
      audioContextRef.current = null;
      setMicState(error?.name === "NotAllowedError" ? "denied" : "unavailable");
      setMessage(
        error?.name === "NotAllowedError"
          ? "Microphone permission was not granted"
          : "Microphone preview is unavailable on this browser"
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
    <div className={`eor-audio-card is-${micState}`}>
      <div className="eor-audio-topline">
        <span className="eor-live-pill">
          <span /> {statusLabel}
        </span>
        <span className="eor-meter" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <i
              key={index}
              ref={(node) => {
                meterRefs.current[index] = node;
              }}
            />
          ))}
        </span>
      </div>

      <div className="eor-wave-row" aria-hidden="true">
        {Array.from({ length: AUDIO_BAR_COUNT }, (_, index) => (
          <span
            key={index}
            ref={(node) => {
              barRefs.current[index] = node;
            }}
            style={{ "--bar": `${22 + ((index * 17) % 52)}%` }}
          />
        ))}
      </div>

      <button
        type="button"
        className={`eor-mic-orb ${micState === "active" ? "is-active" : ""}`}
        onClick={toggleMic}
        disabled={micState === "requesting"}
        aria-pressed={micState === "active"}
        aria-label={
          micState === "active"
            ? "Turn off microphone preview"
            : "Preview microphone"
        }
      >
        <FaMicrophone aria-hidden="true" />
      </button>

      <div className="eor-audio-controls" aria-hidden="true">
        <span><FaBroadcastTower /></span>
        <span className="active"><FaMicrophone /></span>
        <span><FaSlidersH /></span>
      </div>

      <p className={`eor-mic-caption is-${micState}`} aria-live="polite">
        {message}
      </p>
    </div>
  );
};

const ProfileHero = () => {
  const barRefs = useRef([]);
  const rafRef = useRef(0);

  useEffect(() => {
    const animate = (time = 0) => {
      barRefs.current.forEach((bar, index) => {
        if (!bar) return;

        const waveOne = Math.sin(time * 0.0042 + index * 0.48);
        const waveTwo = Math.sin(time * 0.0024 - index * 0.24);
        const waveThree = Math.sin(time * 0.0013 + index * 0.13);
        const energy =
          0.46 +
          Math.abs(waveOne) * 0.34 +
          Math.abs(waveTwo) * 0.2 +
          Math.abs(waveThree) * 0.1;

        const scale = 0.62 + energy * 0.58;
        const opacity = 0.56 + Math.abs(waveOne) * 0.35;
        bar.style.transform = `scaleY(${scale.toFixed(3)})`;
        bar.style.opacity = opacity.toFixed(3);
      });

      rafRef.current = window.requestAnimationFrame(animate);
    };

    rafRef.current = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="eor-profile-hero-card" aria-hidden="true">
      <div className="eor-profile-avatar"><span /></div>
      <div className="eor-profile-lines"><i /><i /><i /></div>
      <div className="eor-profile-wave">
        {Array.from({ length: PROFILE_BAR_COUNT }, (_, index) => (
          <span
            key={index}
            ref={(node) => {
              barRefs.current[index] = node;
            }}
            style={{ "--bar": `${18 + ((index * 23) % 58)}%` }}
          />
        ))}
      </div>
      <div className="eor-float-badge eor-people"><FaUserFriends /></div>
      <div className="eor-float-badge eor-profile-mic"><FaMicrophone /></div>
      <div className="eor-float-badge eor-heart"><FaHeart /></div>
    </div>
  );
};

const OnboardingFrame = ({
  step,
  hero = "broadcast",
  children,
  panelClassName = "",
  steps: stepLabels = BASIC_STEPS,
  phaseLabel = "Basics",
}) => {
  const isProfile = hero === "profile";
  const isCreator = hero === "creator";
  const totalSteps = stepLabels.length;

  return (
    <main className={`echoo-onboarding-redesign eor-step-${step}`}>
      <section className="eor-hero" aria-label="Echoo onboarding">
        <div className="eor-brand">
          <img src={echooLogo} alt="" aria-hidden="true" />
          <span>Echoo</span>
        </div>

        <div className="eor-hero-copy">
          {isProfile ? (
            <>
              <h1>
                Your <em>voice.</em>
                <br />
                Your <em>identity.</em>
              </h1>
              <p>
                Build your profile so others can discover, connect, and listen.
                Be authentic. Be you.
              </p>
            </>
          ) : isCreator ? (
            <>
              <h1>
                Build your
                <br />
                <em>creator</em> identity.
              </h1>
              <p>
                Shape how you show up on Echoo, then launch your first station,
                schedule a broadcast, or go live.
              </p>
            </>
          ) : (
            <>
              <h1>
                Broadcast
                <br />
                your <em>voice.</em>
              </h1>
              <p>
                Go live. Share your message. Inspire your audience. All in one
                beautiful platform built for audio.
              </p>
            </>
          )}
        </div>

        {isProfile ? <ProfileHero /> : <AudioHero />}
      </section>

      <section className="eor-form-side">
        <div className={`eor-panel ${panelClassName}`}>
          <div className="eor-mobile-brand">
            <div className="eor-mobile-logo">
              <img src={echooLogo} alt="" aria-hidden="true" />
              <strong>Echoo</strong>
            </div>
            <span>{phaseLabel} · {step}/{totalSteps}</span>
          </div>

          <div
            className="eor-stepper"
            aria-label={`${phaseLabel} step ${step} of ${totalSteps}`}
            style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
          >
            {stepLabels.map((label, index) => {
              const number = index + 1;
              const complete = number < step;
              const current = number === step;

              return (
                <div
                  className={`eor-step ${complete ? "complete" : ""} ${
                    current ? "current" : ""
                  }`}
                  key={label}
                >
                  <span className="eor-step-circle">
                    {complete ? <FaCheck /> : number}
                  </span>
                  <span className="eor-step-label">{label}</span>
                  {index < stepLabels.length - 1 && (
                    <span className="eor-step-line" />
                  )}
                </div>
              );
            })}
          </div>

          {children}
        </div>
      </section>
    </main>
  );
};

export default OnboardingFrame;
