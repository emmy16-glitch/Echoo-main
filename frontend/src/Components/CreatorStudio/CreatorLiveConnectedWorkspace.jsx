import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  FaBroadcastTower,
  FaCheck,
  FaMicrophone,
  FaPlus,
  FaSave,
  FaStop,
} from "react-icons/fa";

import EchoAmbient from "../EchooSystem/EchoAmbient";
import EchoAvatar from "../EchooSystem/EchoAvatar";
import EchoWave from "../EchooSystem/EchoWave";

import batch2Service from "../../services/batch2Service";
import batch3Service from "../../services/batch3Service";

import {
  startLiveKitPublishing,
  stopLiveKitPublishing,
} from "../../services/livekitPublisher";

import "./CreatorPhase9.css";

const CATEGORY_OPTIONS = [
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
];

const CreatorLiveConnectedWorkspace = ({
  studioName = "Creator",
  profileImage = null,
}) => {
  const [
    stations,
    setStations,
  ] = useState([]);

  const [
    stationId,
    setStationId,
  ] = useState("");

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    category,
    setCategory,
  ] = useState("Other");

  const [
    savedBroadcast,
    setSavedBroadcast,
  ] = useState(null);

  const [
    currentLiveBroadcast,
    setCurrentLiveBroadcast,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    goingLive,
    setGoingLive,
  ] = useState(false);

  const [
    ending,
    setEnding,
  ] = useState(false);

  const [
    micState,
    setMicState,
  ] = useState("idle");

  const [
    inputLevel,
    setInputLevel,
  ] = useState(0);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    newStationName,
    setNewStationName,
  ] = useState("");

  const [
    creatingStation,
    setCreatingStation,
  ] = useState(false);

  const streamRef =
    useRef(null);

  const contextRef =
    useRef(null);

  const analyserRef =
    useRef(null);

  const frameRef =
    useRef(null);

  const dataRef =
    useRef(null);

  /*
   * Local microphone TEST cleanup.
   *
   * This is separate from the real LiveKit
   * publisher. The test microphone never
   * broadcasts anywhere.
   */
  const cleanupMicTest =
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

      setInputLevel(0);
      setMicState("idle");
    };

  /*
   * Load real stations and creator broadcasts.
   */
  useEffect(() => {
    let active = true;

    const load =
      async () => {
        try {
          const [
            stationResult,
            broadcastResult,
          ] =
            await Promise.all([
              batch2Service
                .getMyStations(),

              batch3Service
                .getCreatorBroadcasts(),
            ]);

          if (!active) {
            return;
          }

          const realStations =
            Array.isArray(
              stationResult?.data
            )
              ? stationResult.data
              : [];

          const broadcasts =
            Array.isArray(
              broadcastResult?.data
            )
              ? broadcastResult.data
              : [];

          setStations(
            realStations
          );

          setStationId(
            realStations[0]?.id ||
              ""
          );

          const live =
            broadcasts.find(
              (
                item
              ) =>
                item.status ===
                "live"
            ) || null;

          setCurrentLiveBroadcast(
            live
          );
        } catch (
          loadError
        ) {
          console.error(
            "Creator Live load:",
            loadError
          );

          if (active) {
            setError(
              loadError?.message ||
                "Could not connect Creator Live to the backend."
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

    load();

    return () => {
      active = false;

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
    };
  }, []);

  /*
   * Microphone meter.
   */
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

      analyser
        .getByteTimeDomainData(
          data
        );

      let total = 0;

      for (
        let index = 0;
        index < data.length;
        index += 1
      ) {
        const normalized =
          (
            data[index] -
            128
          ) / 128;

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
      setError("");
      setMessage("");

      if (
        !navigator
          .mediaDevices
          ?.getUserMedia
      ) {
        setError(
          "Microphone access is not supported by this browser."
        );

        return;
      }

      cleanupMicTest();

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

        await context.resume();

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

        analyser
          .smoothingTimeConstant =
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
        micError
      ) {
        console.error(
          "Microphone test:",
          micError
        );

        cleanupMicTest();

        setError(
          micError?.message ||
            "Echoo could not access your microphone."
        );
      }
    };

  /*
   * Create a station without leaving Live.
   */
  const createStation =
    async () => {
      const name =
        newStationName
          .trim();

      if (
        !name ||
        creatingStation
      ) {
        return;
      }

      try {
        setCreatingStation(
          true
        );

        setError("");
        setMessage("");

        const response =
          await batch2Service
            .createStation({
              name,

              description:
                `${name} on Echoo`,

              category,

              tags: [],
            });

        const station =
          response?.data;

        if (
          !station?.id
        ) {
          throw new Error(
            "Echoo did not return the new station."
          );
        }

        setStations(
          (
            current
          ) => [
            ...current,
            station,
          ]
        );

        setStationId(
          station.id
        );

        setNewStationName(
          ""
        );

        setSavedBroadcast(
          null
        );

        setMessage(
          `${station.name} was created.`
        );
      } catch (
        stationError
      ) {
        setError(
          stationError?.message ||
            "Could not create the station."
        );
      } finally {
        setCreatingStation(
          false
        );
      }
    };

  /*
   * Create/update a real backend broadcast.
   */
  const saveSetup =
    async () => {
      if (
        !stationId ||
        !title.trim() ||
        saving
      ) {
        return;
      }

      try {
        setSaving(true);
        setError("");
        setMessage("");

        const station =
          stations.find(
            (
              item
            ) =>
              String(
                item.id
              ) ===
              String(
                stationId
              )
          );

        /*
         * Immediate Live broadcasts still use the
         * same backend scheduling model.
         *
         * We create it starting now with a generous
         * planned end time. The actual /end route
         * remains authoritative when the creator
         * ends the stream.
         */
        const now =
          new Date();

        /*
         * Keep the saved broadcast in the scheduled/ready state.
         * The /start endpoint is the ONLY action that should make
         * the broadcast live.
         */
        const scheduledStart =
          new Date(
            now.getTime() +
              10 *
                60 *
                1000
          );

        const plannedEnd =
          new Date(
            scheduledStart.getTime() +
              4 *
                60 *
                60 *
                1000
          );

        let response;

        if (
          savedBroadcast?.id &&
          savedBroadcast
            .status !==
            "live"
        ) {
          response =
            await batch2Service
              .updateBroadcast(
                savedBroadcast.id,
                {
                  title:
                    title.trim(),

                  description:
                    description
                      .trim(),

                  stationId,

                  startTime:
                    scheduledStart.toISOString(),

                  status:
                    "scheduled",

                  endTime:
                    plannedEnd
                      .toISOString(),

                  type:
                    "live",

                  isRecurring:
                    false,

                  isPublic:
                    true,

                  tags: [],

                  coverArt:
                    station
                      ?.coverArt ||
                    null,
                }
              );
        } else {
          response =
            await batch2Service
              .createBroadcast({
                title:
                  title.trim(),

                description:
                  description
                    .trim(),

                stationId,

                startTime:
                  now.toISOString(),

                endTime:
                  plannedEnd
                    .toISOString(),

                type:
                  "live",

                isRecurring:
                  false,

                isPublic:
                  true,

                tags: [],

                coverArt:
                  station
                    ?.coverArt ||
                  null,
              });
        }

        if (
          !response?.data?.id
        ) {
          throw new Error(
            "Echoo did not return a broadcast ID."
          );
        }

        setSavedBroadcast(
          response.data
        );

        setMessage(
          "Broadcast setup saved to Echoo."
        );

        return response.data;
      } catch (
        saveError
      ) {
        console.error(
          "Save Live setup:",
          saveError
        );

        setError(
          saveError?.message ||
            "Could not save the broadcast."
        );

        return null;
      } finally {
        setSaving(false);
      }
    };

  /*
   * Start:
   *
   * backend -> LiveKit room/token ->
   * browser microphone -> LiveKit
   */
  const goLive =
    async () => {
      if (
        goingLive ||
        currentLiveBroadcast
      ) {
        return;
      }

      if (
        !title.trim()
      ) {
        setError(
          "Add a broadcast title first."
        );

        return;
      }

      if (
        !stationId
      ) {
        setError(
          "Choose or create a station first."
        );

        return;
      }

      if (
        micState !==
        "ready"
      ) {
        setError(
          "Test your microphone before going live."
        );

        return;
      }

      let broadcast =
        savedBroadcast;

      let backendStarted =
        false;

      try {
        setGoingLive(
          true
        );

        setError("");
        setMessage("");

        if (
          !broadcast?.id
        ) {
          broadcast =
            await saveSetup();
        }

        if (
          !broadcast?.id
        ) {
          throw new Error(
            "Save the broadcast setup before going live."
          );
        }

        /*
         * Release local microphone test first.
         * LiveKit will obtain the actual broadcast mic.
         */
        cleanupMicTest();

        const response =
          await batch3Service
            .startBroadcast(
              broadcast.id
            );

        backendStarted =
          true;

        const connection =
          response?.livekit;

        if (
          !connection?.token
        ) {
          throw new Error(
            "Echoo did not return the creator LiveKit token."
          );
        }

        const liveKitUrl =
          import.meta.env
            .VITE_LIVEKIT_URL;

        if (
          !liveKitUrl
        ) {
          throw new Error(
            "VITE_LIVEKIT_URL is not configured."
          );
        }

        await startLiveKitPublishing({
          url:
            liveKitUrl,

          token:
            connection.token,

          broadcastId:
            broadcast.id,
        });

        const liveBroadcast = {
          ...broadcast,
          status:
            "live",
          isLive:
            true,
        };

        setSavedBroadcast(
          liveBroadcast
        );

        setCurrentLiveBroadcast(
          liveBroadcast
        );

        setMessage(
          `${broadcast.title} is LIVE. Your microphone is now being sent through LiveKit.`
        );
      } catch (
        liveError
      ) {
        console.error(
          "Creator Go Live:",
          liveError
        );

        await stopLiveKitPublishing()
          .catch(
            () => {}
          );

        if (
          backendStarted &&
          broadcast?.id
        ) {
          try {
            await batch3Service
              .endBroadcast(
                broadcast.id
              );
          } catch (
            rollbackError
          ) {
            console.error(
              "Could not roll back failed broadcast:",
              rollbackError
            );
          }
        }

        setCurrentLiveBroadcast(
          null
        );

        setError(
          liveError?.message ||
            "Echoo could not start the live broadcast."
        );
      } finally {
        setGoingLive(
          false
        );
      }
    };

  const reconnectMicrophone =
    async () => {
      const broadcast =
        currentLiveBroadcast;

      if (
        !broadcast?.id ||
        goingLive
      ) {
        return;
      }

      try {
        setGoingLive(true);
        setError("");

        const connection =
          await batch3Service
            .getLiveKitToken(
              broadcast.id
            );

        const liveKitUrl =
          import.meta.env
            .VITE_LIVEKIT_URL;

        if (
          !connection?.token ||
          !liveKitUrl
        ) {
          throw new Error(
            "Could not obtain LiveKit connection details."
          );
        }

        await startLiveKitPublishing({
          url:
            liveKitUrl,

          token:
            connection.token,

          broadcastId:
            broadcast.id,
        });

        setMessage(
          "Broadcast microphone reconnected."
        );
      } catch (
        reconnectError
      ) {
        setError(
          reconnectError?.message ||
            "Could not reconnect the microphone."
        );
      } finally {
        setGoingLive(false);
      }
    };

  const endBroadcast =
    async () => {
      const broadcast =
        currentLiveBroadcast;

      if (
        !broadcast?.id ||
        ending
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `End "${broadcast.title}" now?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setEnding(true);
        setError("");

        await stopLiveKitPublishing();

        await batch3Service
          .endBroadcast(
            broadcast.id
          );

        setCurrentLiveBroadcast(
          null
        );

        setSavedBroadcast(
          null
        );

        setMessage(
          `${broadcast.title} has ended.`
        );
      } catch (
        endError
      ) {
        setError(
          endError?.message ||
            "Could not end the broadcast."
        );
      } finally {
        setEnding(false);
      }
    };

  const speaking =
    micState ===
      "ready" &&
    inputLevel >
      0.055;

  const backendReady =
    Boolean(
      savedBroadcast?.id
    );

  const microphoneReady =
    micState ===
      "ready";

  const formReady =
    Boolean(
      title.trim() &&
      stationId
    );

  const isLive =
    Boolean(
      currentLiveBroadcast
    );

  const waveState =
    isLive
      ? "speaking"
      : speaking
        ? "speaking"
        : microphoneReady
          ? "playing"
          : "idle";

  if (
    loading
  ) {
    return (
      <section className="creator9-page">
        <div className="creator9-live-loading">
          Connecting Creator Live...
        </div>
      </section>
    );
  }

  return (
    <section className="creator9-page creator9-live">
      <header className="creator9-page-header">
        <div>
          <span className="creator9-kicker">
            CREATOR LIVE
          </span>

          <h1>
            {isLive
              ? "You are live."
              : "Prepare your signal."}
          </h1>

          <p>
            {isLive
              ? "Your microphone is publishing through LiveKit and listeners can join the broadcast."
              : "Choose a station, prepare the broadcast and test your microphone before going live."}
          </p>
        </div>

        <span
          className={`creator9-backend-badge ${
            isLive
              ? "live"
              : ""
          }`}
        >
          {isLive
            ? "LIVE · LiveKit connected"
            : "Backend connected · LiveKit ready"}
        </span>
      </header>

      <div className="creator9-live-layout">
        <section className="creator9-live-stage">
          <EchoAmbient
            density="low"
            className="creator9-live-ambient"
          />

          <div className="creator9-live-stage-content">
            <span
              className={`creator9-stage-state ${
                isLive
                  ? "live"
                  : ""
              }`}
            >
              {isLive
                ? "LIVE NOW"
                : micState ===
                    "requesting"
                  ? "Requesting microphone"
                  : microphoneReady
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
                isLive
                  ? "speaking"
                  : speaking
                    ? "speaking"
                    : microphoneReady
                      ? "listening"
                      : "idle"
              }
              size="xl"
            />

            <h2>
              {currentLiveBroadcast
                ?.title ||
                title.trim() ||
                "Your live conversation"}
            </h2>

            <p>
              {studioName}
            </p>

            <EchoWave
              state={
                waveState
              }
            />

            {!isLive && (
              <>
                <div className="creator9-mic-level">
                  <span>
                    Microphone level
                  </span>

                  <div>
                    <i
                      style={{
                        width:
                          `${inputLevel * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="creator9-mic-actions">
                  {microphoneReady ? (
                    <button
                      type="button"
                      onClick={
                        cleanupMicTest
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
              </>
            )}

            {isLive && (
              <div className="creator9-live-actions-real">
                <button
                  type="button"
                  onClick={
                    reconnectMicrophone
                  }
                  disabled={
                    goingLive
                  }
                >
                  <FaMicrophone />
                  {goingLive
                    ? "Connecting..."
                    : "Reconnect microphone"}
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={
                    endBroadcast
                  }
                  disabled={
                    ending
                  }
                >
                  <FaStop />
                  {ending
                    ? "Ending..."
                    : "End broadcast"}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="creator9-live-setup">
          <div className="creator9-workspace-heading">
            <div>
              <h2>
                Broadcast setup
              </h2>

              <p>
                Broadcast details are
                persisted in Echoo's
                backend before the
                stream starts.
              </p>
            </div>
          </div>

          {!isLive && (
            <>
              <label className="creator9-field">
                <span>
                  Station
                </span>

                <select
                  value={
                    stationId
                  }
                  disabled={
                    saving ||
                    goingLive
                  }
                  onChange={(
                    event
                  ) => {
                    setStationId(
                      event.target
                        .value
                    );

                    setSavedBroadcast(
                      null
                    );
                  }}
                >
                  <option value="">
                    Select a station
                  </option>

                  {stations.map(
                    (
                      station
                    ) => (
                      <option
                        key={
                          station.id
                        }
                        value={
                          station.id
                        }
                      >
                        {
                          station.name
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <div className="creator9-inline-station-create">
                <input
                  type="text"
                  maxLength={80}
                  value={
                    newStationName
                  }
                  placeholder="Create a new station"
                  onChange={(
                    event
                  ) =>
                    setNewStationName(
                      event.target
                        .value
                    )
                  }
                />

                <button
                  type="button"
                  disabled={
                    !newStationName
                      .trim() ||
                    creatingStation
                  }
                  onClick={
                    createStation
                  }
                >
                  <FaPlus />

                  {creatingStation
                    ? "Creating..."
                    : "Create"}
                </button>
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
                  ) => {
                    setTitle(
                      event.target
                        .value
                    );

                    if (
                      savedBroadcast
                    ) {
                      setSavedBroadcast(
                        null
                      );
                    }
                  }}
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
                  {CATEGORY_OPTIONS.map(
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
                    formReady
                      ? "complete"
                      : ""
                  }
                >
                  <span>
                    <FaCheck />
                  </span>

                  <p>
                    Choose a station
                    and title
                  </p>
                </div>

                <div
                  className={
                    microphoneReady
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

                <div
                  className={
                    backendReady
                      ? "complete"
                      : ""
                  }
                >
                  <span>
                    <FaCheck />
                  </span>

                  <p>
                    Save broadcast
                    to Echoo
                  </p>
                </div>
              </div>

              {message && (
                <div className="creator9-inline-message success">
                  {message}
                </div>
              )}

              {error && (
                <div className="creator9-inline-message error">
                  {error}
                </div>
              )}

              <div className="creator9-live-footer">
                <button
                  type="button"
                  onClick={
                    saveSetup
                  }
                  disabled={
                    !formReady ||
                    saving
                  }
                >
                  <FaSave />

                  {saving
                    ? "Saving..."
                    : backendReady
                      ? "Setup saved"
                      : "Save setup"}
                </button>

                <button
                  type="button"
                  className="creator9-real-go-live"
                  disabled={
                    !formReady ||
                    !microphoneReady ||
                    goingLive
                  }
                  onClick={
                    goLive
                  }
                >
                  <FaBroadcastTower />

                  {goingLive
                    ? "Starting..."
                    : "Go live"}
                </button>
              </div>

              <p className="creator9-technical-note">
                Microphone testing stays
                local until you press Go
                live. When live, Echoo
                publishes your microphone
                through LiveKit to
                listeners.
              </p>
            </>
          )}

          {isLive && (
            <div className="creator9-real-live-summary">
              <span className="creator9-real-live-pill">
                LIVE
              </span>

              <h3>
                {
                  currentLiveBroadcast
                    ?.title
                }
              </h3>

              <p>
                {
                  currentLiveBroadcast
                    ?.stationName
                }
              </p>

              <div>
                <FaMicrophone />
                Microphone publishing
                through LiveKit
              </div>

              <div>
                <FaBroadcastTower />
                Listeners can join this
                broadcast now
              </div>

              {message && (
                <div className="creator9-inline-message success">
                  {message}
                </div>
              )}

              {error && (
                <div className="creator9-inline-message error">
                  {error}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
};

export default CreatorLiveConnectedWorkspace;
