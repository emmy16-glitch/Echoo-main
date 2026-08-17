import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  FaCheck,
  FaMicrophone,
  FaSave,
  FaStop,
} from "react-icons/fa";

import EchoAmbient from "../EchooSystem/EchoAmbient";
import EchoAvatar from "../EchooSystem/EchoAvatar";
import EchoSignal from "../EchooSystem/EchoSignal";
import EchoWave from "../EchooSystem/EchoWave";

import "./CreatorPhase9.css";

const LIVE_DRAFT_KEY =
  "echoo-creator-live-setup-v1";

const readLiveDraft =
  () => {
    try {
      const value =
        JSON.parse(
          localStorage.getItem(
            LIVE_DRAFT_KEY
          ) ||
            "{}"
        );

      return {
        title:
          value.title ||
          "",

        description:
          value.description ||
          "",

        category:
          value.category ||
          "Other",
      };
    } catch {
      return {
        title: "",
        description: "",
        category:
          "Other",
      };
    }
  };

const CreatorLiveWorkspace = ({
  studioName =
    "Creator",

  profileImage =
    null,
}) => {
  const initialDraft =
    readLiveDraft();

  const [
    title,
    setTitle,
  ] = useState(
    initialDraft.title
  );

  const [
    description,
    setDescription,
  ] = useState(
    initialDraft.description
  );

  const [
    category,
    setCategory,
  ] = useState(
    initialDraft.category
  );

  const [
    micState,
    setMicState,
  ] = useState(
    "idle"
  );

  const [
    inputLevel,
    setInputLevel,
  ] = useState(0);

  const [
    message,
    setMessage,
  ] = useState("");

  const streamRef =
    useRef(null);

  const contextRef =
    useRef(null);

  const frameRef =
    useRef(null);

  const analyserRef =
    useRef(null);

  const dataRef =
    useRef(null);

  const cleanupMic =
    useCallback(
      () => {
        if (
          frameRef.current
        ) {
          cancelAnimationFrame(
            frameRef.current
          );

          frameRef.current =
            null;
        }

        if (
          streamRef.current
        ) {
          streamRef.current
            .getTracks()
            .forEach(
              (
                track
              ) =>
                track.stop()
            );

          streamRef.current =
            null;
        }

        if (
          contextRef.current
        ) {
          contextRef.current
            .close()
            .catch(
              () => {}
            );

          contextRef.current =
            null;
        }

        analyserRef.current =
          null;

        dataRef.current =
          null;

        setInputLevel(
          0
        );

        setMicState(
          "idle"
        );
      },
      []
    );

  useEffect(
    () =>
      () => {
        if (
          frameRef.current
        ) {
          cancelAnimationFrame(
            frameRef.current
          );
        }

        if (
          streamRef.current
        ) {
          streamRef.current
            .getTracks()
            .forEach(
              (
                track
              ) =>
                track.stop()
            );
        }

        if (
          contextRef.current
        ) {
          contextRef.current
            .close()
            .catch(
              () => {}
            );
        }
      },
    []
  );

  const runMeter =
    () => {
      const analyser =
        analyserRef.current;

      const data =
        dataRef.current;

      if (
        !analyser ||
        !data
      ) {
        return;
      }

      analyser.getByteTimeDomainData(
        data
      );

      let total =
        0;

      for (
        let index = 0;
        index <
        data.length;
        index += 1
      ) {
        const normalized =
          (
            data[index] -
            128
          ) /
          128;

        total +=
          normalized *
          normalized;
      }

      const rms =
        Math.sqrt(
          total /
            data.length
        );

      const level =
        Math.max(
          0,
          Math.min(
            1,
            rms * 4.2
          )
        );

      setInputLevel(
        level
      );

      frameRef.current =
        requestAnimationFrame(
          runMeter
        );
    };

  const startMicTest =
    async () => {
      setMessage("");

      if (
        !navigator.mediaDevices
          ?.getUserMedia
      ) {
        setMessage(
          "Microphone testing is not supported by this browser."
        );

        return;
      }

      cleanupMic();

      try {
        setMicState(
          "requesting"
        );

        const stream =
          await navigator
            .mediaDevices
            .getUserMedia({
              audio: true,
            });

        const AudioContextClass =
          window.AudioContext ||
          window.webkitAudioContext;

        if (
          !AudioContextClass
        ) {
          stream
            .getTracks()
            .forEach(
              (
                track
              ) =>
                track.stop()
            );

          throw new Error(
            "Web Audio is not available in this browser."
          );
        }

        const context =
          new AudioContextClass();

        const source =
          context
            .createMediaStreamSource(
              stream
            );

        const analyser =
          context
            .createAnalyser();

        analyser.fftSize =
          256;

        analyser.smoothingTimeConstant =
          0.72;

        source.connect(
          analyser
        );

        const data =
          new Uint8Array(
            analyser.fftSize
          );

        streamRef.current =
          stream;

        contextRef.current =
          context;

        analyserRef.current =
          analyser;

        dataRef.current =
          data;

        setMicState(
          "ready"
        );

        runMeter();
      } catch (
        error
      ) {
        console.error(
          "Microphone test:",
          error
        );

        cleanupMic();

        setMessage(
          error?.message ||
          "Echoo could not access your microphone."
        );
      }
    };

  const saveDraft =
    () => {
      localStorage.setItem(
        LIVE_DRAFT_KEY,
        JSON.stringify({
          title:
            title.trim(),

          description:
            description.trim(),

          category,

          updatedAt:
            new Date()
              .toISOString(),
        })
      );

      setMessage(
        "Broadcast setup saved on this browser."
      );
    };

  const speaking =
    micState ===
      "ready" &&
    inputLevel >
      0.055;

  const signalState =
    micState ===
    "requesting"
      ? "loading"
      : speaking
        ? "speaking"
        : micState ===
            "ready"
          ? "listening"
          : "idle";

  const waveState =
    speaking
      ? "speaking"
      : micState ===
          "ready"
        ? "playing"
        : "idle";

  return (
    <section className="creator9-page creator9-live">
      <header className="creator9-page-header">
        <div>
          <span className="creator9-kicker">
            CREATOR LIVE
          </span>

          <h1>
            Prepare your signal.
          </h1>

          <p>
            Set up your broadcast
            and test the one host
            microphone before
            going live.
          </p>
        </div>

        <span className="creator9-backend-badge">
          Broadcast state connected · audio transport pending
        </span>
      </header>

      <div className="creator9-live-layout">
        <section className="creator9-live-stage">
          <EchoAmbient
            density="low"
            className="creator9-live-ambient"
          />

          <div className="creator9-live-stage-content">
            <span className="creator9-stage-state">
              {micState ===
              "requesting"
                ? "Requesting microphone"
                : micState ===
                    "ready"
                  ? speaking
                    ? "Speaking"
                    : "Microphone ready"
                  : "Offline"}
            </span>

            <EchoAvatar
              image={
                profileImage
              }
              name={
                studioName
              }
              state={
                signalState
              }
              size="xl"
            />

            <h2>
              {title.trim() ||
                "Your live conversation"}
            </h2>

            <p>
              {
                studioName
              }
            </p>

            <EchoWave
              state={
                waveState
              }
            />

            <div className="creator9-mic-level">
              <span>
                Microphone level
              </span>

              <div>
                <i
                  style={{
                    width:
                      `${
                        inputLevel *
                        100
                      }%`,
                  }}
                />
              </div>
            </div>

            <div className="creator9-mic-actions">
              {micState ===
              "ready" ? (
                <button
                  type="button"
                  onClick={
                    cleanupMic
                  }
                >
                  <FaStop />
                  Stop test
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={
                    micState ===
                    "requesting"
                  }
                  onClick={
                    startMicTest
                  }
                >
                  <FaMicrophone />

                  {micState ===
                  "requesting"
                    ? "Requesting..."
                    : "Test microphone"}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="creator9-live-setup">
          <div className="creator9-workspace-heading">
            <div>
              <h2>
                Broadcast setup
              </h2>

              <p>
                These details stay
                as a browser draft
                until real broadcast
                routes are connected.
              </p>
            </div>
          </div>

          <label className="creator9-field">
            <span>
              Broadcast title
            </span>

            <input
              type="text"
              maxLength={120}
              value={
                title
              }
              placeholder="What are you talking about?"
              onChange={(
                event
              ) =>
                setTitle(
                  event.target
                    .value
                )
              }
            />
          </label>

          <label className="creator9-field">
            <span>
              Category
            </span>

            <select
              value={
                category
              }
              onChange={(
                event
              ) =>
                setCategory(
                  event.target
                    .value
                )
              }
            >
              {[
                "Faith & Spirituality",
                "Education",
                "News & Politics",
                "Business",
                "Health & Wellness",
                "Entertainment",
                "Technology",
                "Sports",
                "Music",
                "Comedy",
                "Storytelling",
                "Other",
              ].map(
                (
                  item
                ) => (
                  <option
                    key={
                      item
                    }
                    value={
                      item
                    }
                  >
                    {item}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="creator9-field">
            <span>
              Description
            </span>

            <textarea
              rows={5}
              maxLength={500}
              value={
                description
              }
              placeholder="Give listeners a reason to join."
              onChange={(
                event
              ) =>
                setDescription(
                  event.target
                    .value
                )
              }
            />
          </label>

          <div className="creator9-live-checklist">
            <div
              className={
                title.trim()
                  ? "complete"
                  : ""
              }
            >
              <span>
                <FaCheck />
              </span>

              <p>
                Add a clear
                broadcast title
              </p>
            </div>

            <div
              className={
                micState ===
                "ready"
                  ? "complete"
                  : ""
              }
            >
              <span>
                <FaCheck />
              </span>

              <p>
                Test your host
                microphone
              </p>
            </div>

            <div>
              <span>
                <FaCheck />
              </span>

              <p>
                Connect the real
                broadcast backend
              </p>
            </div>
          </div>

          {message && (
            <div className="creator9-inline-message">
              {
                message
              }
            </div>
          )}

          <div className="creator9-live-footer">
            <button
              type="button"
              onClick={
                saveDraft
              }
            >
              <FaSave />
              Save setup
            </button>

            <button
              type="button"
              className="creator9-live-disabled"
              disabled
              title="Backend broadcast route is not connected yet."
            >
              Go live
            </button>
          </div>

          <p className="creator9-technical-note">
            Echoo is not sending
            microphone audio to a
            server in this phase.
            The microphone test
            stays inside your
            browser.
          </p>
        </section>
      </div>
    </section>
  );
};

export default CreatorLiveWorkspace;
