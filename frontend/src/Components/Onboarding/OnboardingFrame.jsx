import { useMemo } from "react";
import {
  FaCheck,
  FaHeadphones,
  FaMicrophone,
  FaPause,
  FaPlay,
  FaVolumeUp,
} from "react-icons/fa";
import echooLogo from "../Assets/echoo-brand-logo.png";
import creatorArtwork from "../Assets/creator-logo.png";
import signalWave from "../Assets/echoo-patterns/signal-wave.svg";
import "./onboarding-redesign.css";
import "./onboarding-animation-fix.css";
import "./onboarding-layout-audit.css";
import "./onboarding-dynamic-hero.css";

const BASIC_STEPS = ["Account", "Profile"];
const AUDIO_BAR_COUNT = 44;
const PROFILE_BAR_COUNT = 24;

const buildBars = (count, seed = 5, min = 16, max = 92) =>
  Array.from({ length: count }, (_, index) => {
    const wave = Math.abs(Math.sin((index + seed) * 0.73));
    const pulse = Math.abs(Math.cos((index + seed) * 0.31));
    return Math.round(min + (max - min) * (0.58 * wave + 0.42 * pulse));
  });

const AudioHero = () => {
  const bars = useMemo(() => buildBars(AUDIO_BAR_COUNT), []);

  return (
    <div className="eor-audio-card" aria-hidden="true">
      <div className="eor-audio-card-top">
        <span className="eor-live-chip"><i /> LIVE</span>
        <span className="eor-audio-time">00:12:42</span>
      </div>

      <div className="eor-audio-wave">
        {bars.map((height, index) => (
          <span
            key={index}
            className={index % 7 === 0 ? "peak" : ""}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <div className="eor-audio-controls">
        <button type="button" aria-label="Previous" tabIndex="-1"><FaPause /></button>
        <button type="button" className="primary" aria-label="Play" tabIndex="-1"><FaPlay /></button>
        <button type="button" aria-label="Volume" tabIndex="-1"><FaVolumeUp /></button>
      </div>
    </div>
  );
};

const ProfileHero = ({ profileName = "Your profile", profileHandle = "@echoo", profileImage = null }) => {
  const bars = useMemo(() => buildBars(PROFILE_BAR_COUNT, 11, 12, 82), []);

  return (
    <div className="eor-profile-hero-card" aria-hidden="true">
      <div className="eor-profile-hero-top">
        <span className="eor-profile-hero-avatar">
          {profileImage ? <img src={profileImage} alt="" /> : <FaHeadphones />}
        </span>
        <div>
          <strong>{profileName}</strong>
          <span>{profileHandle}</span>
        </div>
      </div>

      <div className="eor-profile-hero-wave">
        {bars.map((height, index) => (
          <span key={index} style={{ height: `${height}%` }} />
        ))}
      </div>

      <div className="eor-profile-hero-meta">
        <span><FaMicrophone /> Listener profile</span>
        <span>Ready to discover</span>
      </div>
    </div>
  );
};

const CreatorHero = ({ creatorName = "Your creator space", creatorHandle = "@creator" }) => (
  <div className="eor-creator-hero-card" aria-hidden="true">
    <img className="eor-creator-hero-art" src={creatorArtwork} alt="" />
    <img className="eor-creator-signal" src={signalWave} alt="" />
    <div className="eor-creator-hero-copy">
      <span>CREATOR STUDIO</span>
      <strong>{creatorName}</strong>
      <small>{creatorHandle}</small>
    </div>
  </div>
);

const StepProgress = ({ step, stepLabels, phaseLabel, className = "" }) => (
  <div className={`eor-step-progress ${className}`.trim()}>
    <div className="eor-step-progress-meta">
      <span>{phaseLabel}</span>
      <strong>Step {Math.min(step, stepLabels.length)} of {stepLabels.length}</strong>
    </div>
    <div className="eor-step-track" aria-label={`${phaseLabel}, step ${Math.min(step, stepLabels.length)} of ${stepLabels.length}`}>
      {stepLabels.map((label, index) => {
        const number = index + 1;
        const complete = number < step;
        const current = number === step;
        return (
          <div
            className={`eor-step ${complete ? "complete" : ""} ${current ? "current" : ""}`}
            key={label}
          >
            <span className="eor-step-circle">{complete ? <FaCheck /> : number}</span>
            <span className="eor-step-label">{label}</span>
            {index < stepLabels.length - 1 && <span className="eor-step-line" />}
          </div>
        );
      })}
    </div>
  </div>
);

const OnboardingFrame = ({
  step,
  hero = "broadcast",
  children,
  panelClassName = "",
  steps: stepLabels = BASIC_STEPS,
  phaseLabel = "Basics",
  heroData = {},
}) => {
  const isProfile = hero === "profile";
  const isCreator = hero === "creator";

  return (
    <main className={`echoo-onboarding-redesign eor-step-${step}`}>
      <section className="eor-hero" aria-label="Echoo onboarding">
        <div className="eor-brand">
          <img src={echooLogo} alt="" aria-hidden="true" />
          <span>Echoo</span>
        </div>

        <StepProgress
          step={step}
          stepLabels={stepLabels}
          phaseLabel={phaseLabel}
          className="eor-mobile-stepper"
        />

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
                Shape how you show up on Echoo, then launch your Channel,
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

        {isProfile ? (
          <ProfileHero {...heroData} />
        ) : isCreator ? (
          <CreatorHero {...heroData} />
        ) : (
          <AudioHero />
        )}
      </section>

      <section className="eor-form-side">
        <div className={`eor-panel ${panelClassName}`}>
          <StepProgress step={step} stepLabels={stepLabels} phaseLabel={phaseLabel} />
          {children}
        </div>
      </section>
    </main>
  );
};

export default OnboardingFrame;
