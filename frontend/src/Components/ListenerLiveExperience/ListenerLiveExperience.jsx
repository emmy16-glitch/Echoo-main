import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";

import {
  FaArrowLeft,
  FaBell,
  FaBroadcastTower,
  FaCheck,
  FaClock,
  FaEllipsisH,
  FaFlag,
  FaHeart,
  FaHeadphones,
  FaLink,
  FaMicrophone,
  FaPaperPlane,
  FaPause,
  FaPlay,
  FaRegHeart,
  FaReply,
  FaShareAlt,
  FaSmile,
  FaThumbtack,
  FaUsers,
  FaVolumeUp,
  FaWifi,
} from "react-icons/fa";

import {
  compactNumber,
  getBroadcast,
  getCreator,
  getCreatorLive,
  getStation,
  getStationLive,
  mockSocial,
} from "../../services/listenerMockService";

import momentService, {
  formatTimestamp,
  parseTimestamp,
} from "../../services/momentService";
import LiveMomentsPanel from "./LiveMomentsPanel";

import ListenerToast from "../ListenerUI/ListenerToast";
import ListenerModal from "../ListenerUI/ListenerModal";

import "../ListenerUI/ListenerBeautiful.css";
import "./ListenerLiveExperience.css";
import EchoSignal from "../EchooSystem/EchoSignal";
import EchoWave from "../EchooSystem/EchoWave";
import "./ListenerLiveExperience.figma.css";
import "./ListenerLiveExperience.identity.css";
import "./ListenerLiveExperience.phase12.css";

import batch1Service from "../../services/batch1Service";
const mockIncoming = [
  {
    author:
      "Blessing",

    initials:
      "BL",

    text:
      "This is such a beautiful moment 🙏",
  },

  {
    author:
      "David",

    initials:
      "DA",

    text:
      "Listening with my family ❤️",
  },

  {
    author:
      "Favour",

    initials:
      "FA",

    text:
      "Powerful. Thank you for this.",
  },

  {
    author:
      "Mariam",

    initials:
      "MA",

    text:
      "Joining from Abuja 👋",
  },
];

const Waveform = ({
  count = 48,
}) => (
  <div className="elx-waveform">
    {Array.from({
      length:
        count,
    }).map(
      (
        _,
        index
      ) => (
        <span
          key={
            index
          }
          style={{
            animationDelay: `${
              index *
              0.025
            }s`,
          }}
        />
      )
    )}
  </div>
);

const AudioRows = ({
  items,
}) => {
  const {
    playTrack,
    currentTrack,
    isPlaying,
    togglePlay,
  } =
    useOutletContext();

  const play = (
    track
  ) => {
    if (
      currentTrack?.id ===
      track.id
    ) {
      togglePlay();

      return;
    }

    playTrack(
      track,
      items
    );
  };

  return (
    <div className="elx-audio-list">
      {items.map(
        (
          item
        ) => (
          <div
            className="elx-audio-row"
            key={
              item.id
            }
          >
            <button
              type="button"
              onClick={() =>
                play(
                  item
                )
              }
            >
              {currentTrack?.id ===
                item.id &&
              isPlaying ? (
                <FaPause />
              ) : (
                <FaPlay />
              )}
            </button>

            <div>
              <strong>
                {
                  item.title
                }
              </strong>

              <span>
                {
                  item.subtitle ||
                  item.genre
                }
              </span>
            </div>

            <small>
              {
                item.genre
              }
            </small>
          </div>
        )
      )}
    </div>
  );
};

export const ListenerLiveRoom =
  () => {
    const {
      broadcastId,
    } =
      useParams();

    const navigate =
      useNavigate();

    const [
      searchParams,
      setSearchParams,
    ] =
      useSearchParams();

    const {
      playTrack,
      playTrackAt,
      currentTrack,
      currentTime,
    } =
      useOutletContext();

    const broadcast =
      getBroadcast(
        broadcastId
      );

    const creator =
      broadcast
        ? getCreator(
            broadcast.creatorId
          )
        : null;

    const station =
      broadcast
        ? getStation(
            broadcast.stationId
          )
        : null;

    const chatRef =
      useRef(
        null
      );

    const incomingRef =
      useRef(
        0
      );

    const [
      listening,
      setListening,
    ] = useState(
      false
    );

    const [
      followingCreator,
      setFollowingCreator,
    ] = useState(
      creator
        ? mockSocial.isFollowingCreator(
            creator.id
          )
        : false
    );

    const [
      followingStation,
      setFollowingStation,
    ] = useState(
      station
        ? mockSocial.isFollowingStation(
            station.id
          )
        : false
    );

    const [
      messages,
      setMessages,
    ] = useState(
      broadcast
        ? mockSocial.getChat(
            broadcast.id
          )
        : []
    );

    const [
      messageText,
      setMessageText,
    ] = useState(
      ""
    );

    const [
      linkAudio,
      setLinkAudio,
    ] = useState(
      false
    );

    const [
      liveElapsedSeconds,
      setLiveElapsedSeconds,
    ] = useState(
      () =>
        parseTimestamp(
          broadcast?.elapsed
        )
    );

    const [
      reactionVersion,
      setReactionVersion,
    ] = useState(
      0
    );

    const [
      replyTo,
      setReplyTo,
    ] = useState(
      null
    );

    const [
      emojiOpen,
      setEmojiOpen,
    ] = useState(
      false
    );

    const [
      shareOpen,
      setShareOpen,
    ] = useState(
      false
    );

    const [
      moreOpen,
      setMoreOpen,
    ] = useState(
      false
    );

    const [
      confirmUnfollow,
      setConfirmUnfollow,
    ] = useState(
      false
    );

    const [
      atBottom,
      setAtBottom,
    ] = useState(
      true
    );

    const [
      unread,
      setUnread,
    ] = useState(
      0
    );

    const [
      online,
      setOnline,
    ] = useState(
      navigator.onLine
    );

    const [
      toast,
      setToast,
    ] = useState({
      open:
        false,

      type:
        "info",

      title:
        "",

      message:
        "",
    });

    const showToast =
      (
        type,
        title,
        message
      ) => {
        setToast({
          open:
            true,

          type,

          title,

          message,
        });
      };

    useEffect(() => {
      const goOnline =
        () => {
          setOnline(
            true
          );

          showToast(
            "success",
            "Back online",
            "Echoo reconnected."
          );
        };

      const goOffline =
        () =>
          setOnline(
            false
          );

      window.addEventListener(
        "online",
        goOnline
      );

      window.addEventListener(
        "offline",
        goOffline
      );

      return () => {
        window.removeEventListener(
          "online",
          goOnline
        );

        window.removeEventListener(
          "offline",
          goOffline
        );
      };
    }, []);

    const forcedState =
      searchParams.get(
        "state"
      );

    const state =
      forcedState ===
      "ended"
        ? "ended"
        : forcedState ===
          "reconnecting"
        ? "reconnecting"
        : !online
        ? "offline"
        : "connected";

    const chatClosed =
      state ===
      "ended";

    useEffect(() => {
      setLiveElapsedSeconds(
        parseTimestamp(
          broadcast?.elapsed
        )
      );
    }, [
      broadcast?.id,
      broadcast?.elapsed,
    ]);

    useEffect(() => {
      if (
        state !==
        "connected"
      ) {
        return undefined;
      }

      const timer =
        window.setInterval(
          () =>
            setLiveElapsedSeconds(
              (
                current
              ) =>
                current +
                1
            ),
          1000
        );

      return () =>
        window.clearInterval(
          timer
        );
    }, [
      state,
      broadcast?.id,
    ]);

    const scrollBottom =
      () => {
        if (
          !chatRef.current
        ) {
          return;
        }

        chatRef.current.scrollTop =
          chatRef.current.scrollHeight;

        setUnread(
          0
        );

        setAtBottom(
          true
        );
      };

    useEffect(() => {
      window.setTimeout(
        scrollBottom,
        60
      );
    }, [
      broadcastId,
    ]);

    useEffect(() => {
      if (
        !broadcast ||
        chatClosed ||
        state !==
          "connected"
      ) {
        return undefined;
      }

      const timer =
        window.setInterval(
          () => {
            const source =
              mockIncoming[
                incomingRef.current %
                  mockIncoming.length
              ];

            incomingRef.current +=
              1;

            const message =
              {
                id:
                  `incoming-${Date.now()}`,

                ...source,

                time:
                  new Date().toLocaleTimeString(
                    [],
                    {
                      hour:
                        "numeric",

                      minute:
                        "2-digit",
                    }
                  ),

                reactions:
                  0,

                incoming:
                  true,
              };

            setMessages(
              (
                current
              ) => [
                ...current,

                message,
              ]
            );

            if (
              atBottom
            ) {
              window.setTimeout(
                scrollBottom,
                30
              );
            } else {
              setUnread(
                (
                  count
                ) =>
                  count +
                  1
              );
            }
          },
          18000
        );

      return () =>
        window.clearInterval(
          timer
        );
    }, [
      broadcast?.id,
      state,
      chatClosed,
      atBottom,
    ]);

    if (
      !broadcast
    ) {
      return (
        <div className="lb-page">
          <div className="lb-empty">
            <div className="lb-empty-icon live">
              <FaBroadcastTower />
            </div>

            <h2>
              Broadcast not found
            </h2>

            <p>
              This Live room does
              not exist in the
              current mock data.
            </p>

            <button
              type="button"
              className="lb-button primary"
              onClick={() =>
                navigate(
                  "/listen/live"
                )
              }
            >
              Back to Live
            </button>
          </div>
        </div>
      );
    }

    const pinned =
      messages.find(
        (
          message
        ) =>
          message.pinned
      );

    const regular =
      messages.filter(
        (
          message
        ) =>
          !message.pinned
      );

    const replayIsCurrent =
      Boolean(
        broadcast?.replay?.id &&
        currentTrack?.id &&
        String(
          broadcast.replay.id
        ) ===
          String(
            currentTrack.id
          )
      );


    const linkedSeconds =
      replayIsCurrent
        ? Math.floor(
            Number(
              currentTime
            ) || 0
          )
        : liveElapsedSeconds;


    const playLinkedTimestamp =
      (
        seconds
      ) => {
        if (
          !broadcast?.replay
        ) {
          showToast(
            "info",
            "Replay unavailable",
            "This message has an audio timestamp, but the replay source is not available yet."
          );

          return;
        }

        if (
          typeof playTrackAt ===
          "function"
        ) {
          playTrackAt(
            broadcast.replay,
            seconds
          );

          return;
        }

        playTrack(
          broadcast.replay
        );
      };


    const saveMessageAsMoment =
      (
        message
      ) => {
        if (
          message.audioTimestamp ===
            null ||
          message.audioTimestamp ===
            undefined
        ) {
          return;
        }

        try {
          momentService.create({
            broadcastId:
              broadcast.id,

            trackId:
              broadcast.replay?.id ||
              null,

            quote:
              message.text,

            creator:
              message.author ||
              creator.name,

            room:
              broadcast.title,

            timestamp:
              message.audioTimestamp,

            clipDuration:
              28,

            sourceTitle:
              broadcast.replay?.title ||
              broadcast.title,
          });

          showToast(
            "success",
            "Moment created",
            `Linked to ${formatTimestamp(
              message.audioTimestamp
            )}.`
          );
        } catch (
          error
        ) {
          showToast(
            "error",
            "Could not create Moment",
            error?.message ||
              "Please try again."
          );
        }
      };


    const sendMessage =
      (
        event
      ) => {
        event.preventDefault();

        const text =
          messageText.trim();

        if (
          !text ||
          chatClosed
        ) {
          return;
        }

        const message =
          mockSocial.sendChat(
            broadcast.id,
            text,
            replyTo,
            linkAudio
              ? {
                  timestamp:
                    linkedSeconds,

                  trackId:
                    broadcast.replay?.id ||
                    null,

                  title:
                    broadcast.replay?.title ||
                    broadcast.title,
                }
              : null
          );

        setMessages(
          (
            current
          ) => [
            ...current,

            message,
          ]
        );

        setMessageText(
          ""
        );

        setReplyTo(
          null
        );

        setLinkAudio(
          false
        );

        setEmojiOpen(
          false
        );

        window.setTimeout(
          scrollBottom,
          30
        );
      };

    const followCreator =
      () => {
        if (
          followingCreator
        ) {
          setConfirmUnfollow(
            true
          );

          return;
        }

        const next =
          mockSocial.toggleCreator(
            creator.id
          );

        setFollowingCreator(
          next
        );

        showToast(
          "success",
          `Following ${creator.name}`,
          `We'll make it easier to see when ${creator.name} goes live.`
        );
      };

    const unfollowCreator =
      () => {
        const next =
          mockSocial.toggleCreator(
            creator.id
          );

        setFollowingCreator(
          next
        );

        setConfirmUnfollow(
          false
        );

        showToast(
          "info",
          `Unfollowed ${creator.name}`,
          "You can follow this creator again anytime."
        );
      };

    const followStation =
      () => {
        const next =
          mockSocial.toggleStation(
            station.id
          );

        setFollowingStation(
          next
        );

        showToast(
          next
            ? "success"
            : "info",

          next
            ? `Following ${station.name}`
            : `Unfollowed ${station.name}`,

          next
            ? "This station is now in your Following library."
            : "The station was removed from Following."
        );
      };

    const copyLink =
      async () => {
        try {
          await navigator.clipboard.writeText(
            window.location.href
          );

          showToast(
            "success",
            "Link copied",
            "The broadcast link is ready to share."
          );
        } catch {
          showToast(
            "info",
            "Broadcast link",
            window.location.href
          );
        }

        setShareOpen(
          false
        );
      };

    const share =
      async () => {
        if (
          navigator.share
        ) {
          try {
            await navigator.share({
              title:
                broadcast.title,

              text:
                broadcast.description,

              url:
                window.location.href,
            });
          } catch {
            //
          }
        } else {
          await copyLink();
        }
      };

    const resetState =
      () => {
        const params =
          new URLSearchParams(
            searchParams
          );

        params.delete(
          "state"
        );

        setSearchParams(
          params
        );
      };

    return (
      <div className="elx-page">
        <ListenerToast
          {...toast}
          onClose={() =>
            setToast(
              (
                current
              ) => ({
                ...current,
                open:
                  false,
              })
            )
          }
        />

        <ListenerModal
          open={
            confirmUnfollow
          }
          size="small"
          title={`Unfollow ${creator.name}?`}
          subtitle="You may see fewer updates from this creator."
          onClose={() =>
            setConfirmUnfollow(
              false
            )
          }
          footer={
            <>
              <button
                type="button"
                className="lb-button"
                onClick={() =>
                  setConfirmUnfollow(
                    false
                  )
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="lb-button danger"
                onClick={
                  unfollowCreator
                }
              >
                Unfollow
              </button>
            </>
          }
        >
          <p className="elx-modal-copy">
            You can follow{" "}
            {creator.name} again
            anytime.
          </p>
        </ListenerModal>

        <header className="elx-topbar">
          <button
            type="button"
            className="elx-back"
            onClick={() =>
              navigate(
                "/listen/live"
              )
            }
          >
            <FaArrowLeft />
            Back to Live
          </button>

          <div className="elx-actions">
            <div className="elx-pop-wrap">
              <button
                type="button"
                className="lb-button"
                onClick={() => {
                  setShareOpen(
                    (
                      value
                    ) =>
                      !value
                  );

                  setMoreOpen(
                    false
                  );
                }}
              >
                <FaShareAlt />
                Share
              </button>

              {shareOpen && (
                <div className="elx-popover">
                  <button
                    type="button"
                    onClick={
                      copyLink
                    }
                  >
                    <FaLink />
                    Copy link
                  </button>

                  <button
                    type="button"
                    onClick={
                      share
                    }
                  >
                    <FaShareAlt />
                    Share...
                  </button>
                </div>
              )}
            </div>

            <div className="elx-pop-wrap">
              <button
                type="button"
                className="elx-icon-button"
                onClick={() => {
                  setMoreOpen(
                    (
                      value
                    ) =>
                      !value
                  );

                  setShareOpen(
                    false
                  );
                }}
              >
                <FaEllipsisH />
              </button>

              {moreOpen && (
                <div className="elx-popover">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/listen/creator/${creator.id}`
                      )
                    }
                  >
                    <FaUsers />
                    View creator
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(
                        false
                      );

                      showToast(
                        "info",
                        "Report received",
                        "Mock report action completed."
                      );
                    }}
                  >
                    <FaFlag />
                    Report broadcast
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="elx-live-grid">
          <main>
            <section
              className={`elx-player variant-${broadcast.variant}`}
            >
              {(broadcast.stageArtwork ||
                broadcast.artwork) && (
                <img
                  className="elx-stage-artwork"
                  src={
                    broadcast.stageArtwork ||
                    broadcast.artwork
                  }
                  alt=""
                />
              )}

              <div className="elx-player-header">
                <span className="elx-live-badge">
                  <i />
                  LIVE
                </span>

                <span className={`elx-connection ${state}`}>
                  <FaWifi />

                  {state ===
                  "connected"
                    ? "Connected"
                    : state ===
                      "reconnecting"
                    ? "Reconnecting"
                    : state ===
                      "offline"
                    ? "Offline"
                    : "Ended"}
                </span>
              </div>

              <div className="elx-player-center">
                
                <EchoSignal
                  size="lg"
                  active
                  speaking={
                    state ===
                    "connected"
                  }
                  className="elx-room-signal"
                >
                  <div className="elx-mic">
                    <FaMicrophone />
                  </div>
                </EchoSignal>

                <EchoWave
                  state={
                    state ===
                    "connected"
                      ? "live"
                      : "idle"
                  }
                />


                <h1>
                  {
                    broadcast.title
                  }
                </h1>

                <p>
                  {
                    broadcast.subtitle
                  }
                </p>

                <div className="elx-player-meta">
                  <span>
                    <FaUsers />

                    {compactNumber(
                      broadcast.listenerCount
                    )}{" "}
                    listening
                  </span>

                  <span>
                    <FaClock />

                    {
                      broadcast.elapsed
                    }
                  </span>
                </div>
              </div>

              {state ===
                "connected" && (
                <div className="elx-listen-bar">
                  <button
                    type="button"
                    className={`elx-listen ${
                      listening
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      setListening(
                        (
                          current
                        ) =>
                          !current
                      )
                    }
                  >
                    {listening ? (
                      <>
                        <FaPause />
                        Listening Live
                      </>
                    ) : (
                      <>
                        <FaPlay />
                        Listen Live
                      </>
                    )}
                  </button>

                  <div className="elx-volume">
                    <FaVolumeUp />

                    <div>
                      <span
                        style={{
                          width:
                            listening
                              ? "72%"
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {state ===
                "reconnecting" && (
                <div className="elx-state">
                  <div className="elx-spinner" />

                  <strong>
                    Trying to
                    reconnect...
                  </strong>

                  <span>
                    Your audio will
                    resume
                    automatically.
                  </span>

                  <button
                    type="button"
                    onClick={
                      resetState
                    }
                  >
                    Retry now
                  </button>
                </div>
              )}

              {state ===
                "offline" && (
                <div className="elx-state">
                  <FaWifi />

                  <strong>
                    Broadcast
                    connection lost
                  </strong>

                  <span>
                    Check your
                    internet
                    connection and
                    try again.
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      window.location.reload()
                    }
                  >
                    Try again
                  </button>
                </div>
              )}

              {state ===
                "ended" && (
                <div className="elx-state">
                  <span className="elx-ended-check">
                    <FaCheck />
                  </span>

                  <strong>
                    Broadcast ended
                  </strong>

                  <span>
                    Thanks for
                    listening to{" "}
                    {
                      broadcast.title
                    }
                    .
                  </span>

                  <div className="elx-ended-actions">
                    <button
                      type="button"
                      onClick={() => {
                        playTrack(
                          broadcast.replay
                        );

                        showToast(
                          "success",
                          "Replay opened",
                          "The mock replay has been sent to your player."
                        );
                      }}
                    >
                      <FaPlay />
                      Listen to Replay
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/listen/creator/${creator.id}`
                        )
                      }
                    >
                      View creator
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="elx-host-card">
              <button
                type="button"
                className="elx-host-main"
                onClick={() =>
                  navigate(
                    `/listen/creator/${creator.id}`
                  )
                }
              >
                <span className="elx-avatar">
                  {creator.avatar ? (
                    <img
                      className="echoo-creator-avatar-image"
                      src={
                        creator.avatar
                      }
                      alt=""
                    />
                  ) : (
                    creator.initials
                  )}
                </span>

                <span>
                  <strong>
                    {
                      creator.name
                    }
                  </strong>

                  <small>
                    Host •{" "}
                    {
                      creator.category
                    }
                  </small>

                  <em>
                    {compactNumber(
                      creator.followers +
                        (followingCreator
                          ? 1
                          : 0)
                    )}{" "}
                    followers
                  </em>
                </span>
              </button>

              <div className="elx-host-actions">
                <button
                  type="button"
                  className={`elx-follow ${
                    followingCreator
                      ? "following"
                      : ""
                  }`}
                  onClick={
                    followCreator
                  }
                >
                  {followingCreator ? (
                    <>
                      <FaCheck />
                      Following
                    </>
                  ) : (
                    <>
                      +
                      Follow
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="lb-button"
                  onClick={
                    share
                  }
                >
                  <FaShareAlt />
                  Share
                </button>
              </div>
            </section>

            <section className="elx-info-card">
              <h2>
                About this
                broadcast
              </h2>

              <span>
                {
                  broadcast.fullCategory
                }
              </span>

              <p>
                {
                  broadcast.description
                }
              </p>
            </section>

            <section className="elx-station-card">
              <button
                type="button"
                className="elx-station-main"
                onClick={() =>
                  navigate(
                    `/listen/stations/${station.id}`
                  )
                }
              >
                <span className="elx-station-icon">
                  <FaHeadphones />
                </span>

                <span>
                  <small>
                    Broadcasting on
                  </small>

                  <strong>
                    {
                      station.name
                    }
                  </strong>

                  <em>
                    {compactNumber(
                      station.followers
                    )}{" "}
                    followers
                  </em>
                </span>
              </button>

              <button
                type="button"
                className={`elx-follow ${
                  followingStation
                    ? "following"
                    : ""
                }`}
                onClick={
                  followStation
                }
              >
                {followingStation ? (
                  <>
                    <FaCheck />
                    Following
                  </>
                ) : (
                  <>
                    +
                    Follow Station
                  </>
                )}
              </button>
            </section>
          </main>

          <aside className="elx-chat">
            <header className="elx-chat-header">
              <div>
                <h2>
                  Live Chat
                </h2>

                <span>
                  <FaUsers />

                  {compactNumber(
                    broadcast.listenerCount
                  )}
                </span>
              </div>

              <span className="elx-chat-live">
                <i />
                LIVE
              </span>
            </header>

            {pinned && (
              <div className="elx-pinned">
                <div>
                  <FaThumbtack />
                  PINNED BY HOST
                </div>

                <strong>
                  {
                    pinned.author
                  }
                </strong>

                <p>
                  {
                    pinned.text
                  }
                </p>
              </div>
            )}

            <div
              ref={
                chatRef
              }
              className="elx-chat-scroll"
              onScroll={(
                event
              ) => {
                const element =
                  event.currentTarget;

                const distance =
                  element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight;

                const bottom =
                  distance <
                  45;

                setAtBottom(
                  bottom
                );

                if (
                  bottom
                ) {
                  setUnread(
                    0
                  );
                }
              }}
            >
              {regular.map(
                (
                  message
                ) => {
                  const reacted =
                    mockSocial.isReacted(
                      message.id
                    );

                  return (
                    <article
                      className={`elx-message ${
                        message.local
                          ? "mine"
                          : ""
                      }`}
                      key={
                        message.id
                      }
                    >
                      <span className="elx-message-avatar">
                        {
                          message.initials
                        }
                      </span>

                      <div>
                        <div className="elx-message-meta">
                          <strong>
                            {
                              message.author
                            }
                          </strong>

                          <span>
                            {
                              message.time
                            }
                          </span>
                        </div>

                        {message.replyTo && (
                          <div className="elx-reply-preview">
                            <strong>
                              {
                                message
                                  .replyTo
                                  .author
                              }
                            </strong>

                            <span>
                              {
                                message
                                  .replyTo
                                  .text
                              }
                            </span>
                          </div>
                        )}

                        <p>
                          {
                            message.text
                          }
                        </p>

                        {message.audioTimestamp !==
                          null &&
                          message.audioTimestamp !==
                            undefined && (
                          <div className="elx-audio-link-row">
                            <button
                              type="button"
                              className="elx-audio-link"
                              onClick={() =>
                                playLinkedTimestamp(
                                  message.audioTimestamp
                                )
                              }
                            >
                              <FaClock />

                              {formatTimestamp(
                                message.audioTimestamp
                              )}

                              <span>
                                Replay from here
                              </span>
                            </button>

                            <button
                              type="button"
                              className="elx-moment-from-chat"
                              onClick={() =>
                                saveMessageAsMoment(
                                  message
                                )
                              }
                            >
                              Moment
                            </button>
                          </div>
                        )}

                        <div className="elx-message-actions">
                          <button
                            type="button"
                            className={
                              reacted
                                ? "reacted"
                                : ""
                            }
                            onClick={() => {
                              mockSocial.toggleReaction(
                                message.id
                              );

                              setReactionVersion(
                                (
                                  value
                                ) =>
                                  value +
                                  1
                              );
                            }}
                          >
                            {reacted ? (
                              <FaHeart />
                            ) : (
                              <FaRegHeart />
                            )}

                            {Number(
                              message.reactions ||
                                0
                            ) +
                              (reacted
                                ? 1
                                : 0)}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setReplyTo(
                                message
                              )
                            }
                          >
                            <FaReply />
                            Reply
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                }
              )}
            </div>

            {unread >
              0 && (
              <button
                type="button"
                className="elx-new-messages"
                onClick={
                  scrollBottom
                }
              >
                ↓{" "}
                {
                  unread
                }{" "}
                new{" "}
                {unread ===
                1
                  ? "message"
                  : "messages"}
              </button>
            )}

            {replyTo && (
              <div className="elx-replying">
                <div>
                  <span>
                    Replying to{" "}
                    {
                      replyTo.author
                    }
                  </span>

                  <strong>
                    {
                      replyTo.text
                    }
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setReplyTo(
                      null
                    )
                  }
                >
                  ×
                </button>
              </div>
            )}

            {chatClosed ? (
              <div className="elx-chat-closed">
                Broadcast ended.
                Chat is now
                closed.
              </div>
            ) : (
              <form
                className="elx-composer"
                onSubmit={
                  sendMessage
                }
              >
                {emojiOpen && (
                  <div className="elx-emojis">
                    {[
                      "❤️",
                      "🙏",
                      "🙌",
                      "🔥",
                      "👏",
                      "😊",
                    ].map(
                      (
                        emoji
                      ) => (
                        <button
                          type="button"
                          key={
                            emoji
                          }
                          onClick={() =>
                            setMessageText(
                              (
                                text
                              ) =>
                                text +
                                emoji
                            )
                          }
                        >
                          {
                            emoji
                          }
                        </button>
                      )
                    )}
                  </div>
                )}

                <button
                  type="button"
                  className={`elx-audio-anchor ${
                    linkAudio
                      ? "active"
                      : ""
                  }`}
                  disabled={
                    !broadcast.replay
                  }
                  title={
                    broadcast.replay
                      ? "Link this message to the current audio position"
                      : "Replay source unavailable"
                  }
                  onClick={() =>
                    setLinkAudio(
                      (
                        current
                      ) =>
                        !current
                    )
                  }
                >
                  <FaClock />

                  <span>
                    {linkAudio
                      ? formatTimestamp(
                          linkedSeconds
                        )
                      : "Link"}
                  </span>
                </button>

                <button
                  type="button"
                  className="elx-emoji-button"
                  onClick={() =>
                    setEmojiOpen(
                      (
                        current
                      ) =>
                        !current
                    )
                  }
                >
                  <FaSmile />
                </button>

                <input
                  value={
                    messageText
                  }
                  maxLength={
                    300
                  }
                  placeholder="Type a message..."
                  onChange={(
                    event
                  ) =>
                    setMessageText(
                      event
                        .target
                        .value
                    )
                  }
                />

                <button
                  type="submit"
                  className="elx-send"
                  disabled={
                    !messageText.trim()
                  }
                >
                  <FaPaperPlane />
                </button>
              </form>
            )}
          </aside>
        </div>

        <LiveMomentsPanel
          broadcast={
            broadcast
          }
          creator={
            creator
          }
          currentTrack={
            currentTrack
          }
          currentTime={
            currentTime
          }
          liveElapsedSeconds={
            liveElapsedSeconds
          }
          playTrack={
            playTrack
          }
          playTrackAt={
            playTrackAt
          }
          showToast={
            showToast
          }
        />

        <div className="elx-dev-states">
          <span>
            Mock UI states:
          </span>

          <button
            type="button"
            onClick={() =>
              setSearchParams({
                state:
                  "reconnecting",
              })
            }
          >
            Reconnecting
          </button>

          <button
            type="button"
            onClick={() =>
              setSearchParams({
                state:
                  "ended",
              })
            }
          >
            Ended
          </button>

          <button
            type="button"
            onClick={
              resetState
            }
          >
            Live
          </button>
        </div>
      </div>
    );
  };

export const ListenerFollowing =
  () => {
    const navigate =
      useNavigate();

    const [
      tab,
      setTab,
    ] = useState(
      "All"
    );

    const [
      version,
      setVersion,
    ] = useState(
      0
    );

    const creators =
      useMemo(
        () =>
          mockSocial.getFollowingCreators(),
        [version]
      );

    const stations =
      useMemo(
        () =>
          mockSocial.getFollowingStations(),
        [version]
      );

    const empty =
      creators.length ===
        0 &&
      stations.length ===
        0;

    return (
      <div className="lb-page elx-social-page">
        <button
          type="button"
          className="elx-back"
          onClick={() =>
            navigate(
              "/listen/library"
            )
          }
        >
          <FaArrowLeft />
          Library
        </button>

        <header className="lb-page-header elx-social-heading">
          <div>
            <div className="lb-page-heading">
              <h1>
                Following
              </h1>
            </div>

            <p>
              Creators and
              stations you want
              to keep up with.
            </p>
          </div>
        </header>

        <div className="lb-chipbar">
          {[
            "All",
            "Creators",
            "Stations",
          ].map(
            (
              item
            ) => (
              <button
                type="button"
                key={
                  item
                }
                className={`lb-chip ${
                  tab ===
                  item
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setTab(
                    item
                  )
                }
              >
                {item}
              </button>
            )
          )}
        </div>

        {empty ? (
          <div className="lb-empty elx-follow-empty">
            <div className="lb-empty-icon">
              <FaHeart />
            </div>

            <h2>
              You're not
              following anyone
              yet
            </h2>

            <p>
              Follow creators
              from Live rooms or
              follow stations and
              they will appear
              here.
            </p>

            <div className="elx-empty-actions">
              <button
                type="button"
                className="lb-button primary"
                onClick={() =>
                  navigate(
                    "/listen/live"
                  )
                }
              >
                Discover Live
              </button>

              <button
                type="button"
                className="lb-button"
                onClick={() =>
                  navigate(
                    "/listen/stations"
                  )
                }
              >
                Browse Stations
              </button>
            </div>
          </div>
        ) : (
          <>
            {(tab ===
              "All" ||
              tab ===
                "Creators") &&
              creators.length >
                0 && (
                <section className="elx-social-section">
                  <h2>
                    Creators
                  </h2>

                  <div className="elx-card-grid">
                    {creators.map(
                      (
                        creator
                      ) => {
                        const live =
                          getCreatorLive(
                            creator.id
                          );

                        return (
                          <article
                            className="elx-follow-card"
                            key={
                              creator.id
                            }
                          >
                            <button
                              type="button"
                              className="elx-follow-main"
                              onClick={() =>
                                navigate(
                                  `/listen/creator/${creator.id}`
                                )
                              }
                            >
                              <span className="elx-profile-avatar">
                                {creator.avatar ? (
                                  <img
                                    className="echoo-creator-avatar-image"
                                    src={
                                      creator.avatar
                                    }
                                    alt=""
                                  />
                                ) : (
                                  creator.initials
                                )}
                              </span>

                              <span>
                                <strong>
                                  {
                                    creator.name
                                  }
                                </strong>

                                <small>
                                  {
                                    creator.category
                                  }
                                </small>

                                <em>
                                  {compactNumber(
                                    creator.followers
                                  )}{" "}
                                  followers
                                </em>
                              </span>
                            </button>

                            {live && (
                              <button
                                type="button"
                                className="elx-follow-live"
                                onClick={() =>
                                  navigate(
                                    `/listen/live/${live.id}`
                                  )
                                }
                              >
                                <FaBroadcastTower />
                                Live now
                              </button>
                            )}

                            <button
                              type="button"
                              className="elx-following"
                              onClick={() => {
                                mockSocial.toggleCreator(
                                  creator.id
                                );

                                setVersion(
                                  (
                                    value
                                  ) =>
                                    value +
                                    1
                                );
                              }}
                            >
                              <FaCheck />
                              Following
                            </button>
                          </article>
                        );
                      }
                    )}
                  </div>
                </section>
              )}

            {(tab ===
              "All" ||
              tab ===
                "Stations") &&
              stations.length >
                0 && (
                <section className="elx-social-section">
                  <h2>
                    Stations
                  </h2>

                  <div className="elx-card-grid">
                    {stations.map(
                      (
                        station
                      ) => {
                        const live =
                          getStationLive(
                            station.id
                          );

                        return (
                          <article
                            className="elx-follow-card"
                            key={
                              station.id
                            }
                          >
                            <button
                              type="button"
                              className="elx-follow-main"
                              onClick={() =>
                                navigate(
                                  `/listen/stations/${station.id}`
                                )
                              }
                            >
                              <span className="elx-profile-avatar station">
                                {station.artwork ? (
                                  <img
                                    className="echoo-creator-avatar-image"
                                    src={
                                      station.artwork
                                    }
                                    alt=""
                                  />
                                ) : (
                                  <FaHeadphones />
                                )}
                              </span>

                              <span>
                                <strong>
                                  {
                                    station.name
                                  }
                                </strong>

                                <small>
                                  {
                                    station.category
                                  }
                                </small>

                                <em>
                                  {compactNumber(
                                    station.followers
                                  )}{" "}
                                  followers
                                </em>
                              </span>
                            </button>

                            {live && (
                              <button
                                type="button"
                                className="elx-follow-live"
                                onClick={() =>
                                  navigate(
                                    `/listen/live/${live.id}`
                                  )
                                }
                              >
                                <FaBroadcastTower />
                                Live now
                              </button>
                            )}

                            <button
                              type="button"
                              className="elx-following"
                              onClick={() => {
                                mockSocial.toggleStation(
                                  station.id
                                );

                                setVersion(
                                  (
                                    value
                                  ) =>
                                    value +
                                    1
                                );
                              }}
                            >
                              <FaCheck />
                              Following
                            </button>
                          </article>
                        );
                      }
                    )}
                  </div>
                </section>
              )}
          </>
        )}
      </div>
    );
  };

export const ListenerCreatorProfile =
  () => {
    const {
      creatorId,
    } = useParams();

    const navigate =
      useNavigate();

    const fallbackCreator =
      getCreator(
        creatorId
      );

    const [
      backendCreator,
      setBackendCreator,
    ] = useState(null);

    const [
      profileLoading,
      setProfileLoading,
    ] = useState(true);

    const [
      following,
      setFollowing,
    ] = useState(
      fallbackCreator
        ? mockSocial.isFollowingCreator(
            fallbackCreator.id
          )
        : false
    );

    const [
      followBusy,
      setFollowBusy,
    ] = useState(false);

    const [
      confirm,
      setConfirm,
    ] = useState(false);

    useEffect(() => {
      let active = true;

      const loadProfile =
        async () => {
          setProfileLoading(true);

          const candidates =
            Array.from(
              new Set(
                [
                  creatorId,
                  fallbackCreator
                    ?.username,
                  fallbackCreator
                    ?.handle
                    ?.replace(
                      /^@/,
                      ""
                    ),
                ].filter(Boolean)
              )
            );

          let loaded = null;

          for (
            const candidate
            of candidates
          ) {
            try {
              const response =
                await batch1Service.getProfile(
                  candidate
                );

              if (
                response?.data
              ) {
                loaded =
                  response.data;
                break;
              }
            } catch (
              error
            ) {
              if (
                error?.status !==
                404
              ) {
                console.warn(
                  "Creator profile backend:",
                  error
                );
              }
            }
          }

          if (!active) {
            return;
          }

          if (loaded) {
            const name =
              loaded.displayName ||
              loaded.creatorProfile
                ?.artistName ||
              loaded.creatorProfile
                ?.organizationName ||
              loaded.username ||
              fallbackCreator
                ?.name ||
              "Echoo Creator";

            const mapped = {
              ...(fallbackCreator || {}),
              backendId:
                loaded.id,
              id:
                loaded.id ||
                fallbackCreator
                  ?.id ||
                creatorId,
              username:
                loaded.username,
              name,
              initials:
                name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map(
                    (part) =>
                      part[0]
                        ?.toUpperCase()
                  )
                  .join("") ||
                "EC",
              avatar:
                loaded.avatar ||
                fallbackCreator
                  ?.avatar ||
                null,
              handle:
                loaded.username
                  ? `@${loaded.username}`
                  : fallbackCreator
                      ?.handle ||
                    "@echoo",
              category:
                loaded.creatorProfile
                  ?.category ||
                fallbackCreator
                  ?.category ||
                "Creator",
              bio:
                loaded.bio ||
                fallbackCreator
                  ?.bio ||
                "This creator is building their presence on Echoo.",
              followers:
                Number(
                  loaded.stats
                    ?.followers
                ) || 0,
              audioCount:
                Number(
                  loaded.stats
                    ?.totalTracks
                ) || 0,
              replayCount:
                Array.isArray(
                  loaded.recentBroadcasts
                )
                  ? loaded
                      .recentBroadcasts
                      .length
                  : Number(
                      fallbackCreator
                        ?.replayCount
                    ) || 0,
              latestAudio:
                fallbackCreator
                  ?.latestAudio ||
                [],
              replays:
                fallbackCreator
                  ?.replays ||
                [],
              upcoming:
                fallbackCreator
                  ?.upcoming ||
                [],
              stationId:
                fallbackCreator
                  ?.stationId ||
                null,
            };

            setBackendCreator(
              mapped
            );

            try {
              const status =
                await batch1Service.getFollowStatus(
                  loaded.id
                );

              if (active) {
                setFollowing(
                  Boolean(
                    status?.data
                      ?.isFollowing
                  )
                );
              }
            } catch {
              if (
                active &&
                fallbackCreator
              ) {
                setFollowing(
                  mockSocial.isFollowingCreator(
                    fallbackCreator.id
                  )
                );
              }
            }
          }

          if (active) {
            setProfileLoading(false);
          }
        };

      loadProfile();

      return () => {
        active = false;
      };
    }, [creatorId]);

    const creator =
      backendCreator ||
      fallbackCreator;

    const live =
      fallbackCreator
        ? getCreatorLive(
            fallbackCreator.id
          )
        : null;

    const station =
      fallbackCreator
        ? getStation(
            fallbackCreator
              .stationId
          )
        : null;

    const follow =
      async () => {
        if (
          !creator ||
          followBusy
        ) {
          return;
        }

        if (following) {
          setConfirm(true);
          return;
        }

        if (
          creator.backendId
        ) {
          try {
            setFollowBusy(true);
            await batch1Service.followCreator(
              creator.backendId
            );
            setFollowing(true);
          } catch (error) {
            console.error(
              "Follow creator error:",
              error
            );
          } finally {
            setFollowBusy(false);
          }

          return;
        }

        setFollowing(
          mockSocial.toggleCreator(
            creator.id
          )
        );
      };

    const unfollow =
      async () => {
        if (
          !creator ||
          followBusy
        ) {
          return;
        }

        if (
          creator.backendId
        ) {
          try {
            setFollowBusy(true);
            await batch1Service.unfollowCreator(
              creator.backendId
            );
            setFollowing(false);
            setConfirm(false);
          } catch (error) {
            console.error(
              "Unfollow creator error:",
              error
            );
          } finally {
            setFollowBusy(false);
          }

          return;
        }

        setFollowing(
          mockSocial.toggleCreator(
            creator.id
          )
        );
        setConfirm(false);
      };

    if (
      profileLoading &&
      !creator
    ) {
      return (
        <div className="lb-page">
          <div className="lb-empty">
            <h2>
              Loading creator...
            </h2>
          </div>
        </div>
      );
    }

    if (!creator) {
      return (
        <div className="lb-page">
          <div className="lb-empty">
            <h2>
              Creator not found
            </h2>

            <button
              type="button"
              className="lb-button"
              onClick={() =>
                navigate(
                  "/listen/live"
                )
              }
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    const latestAudio =
      Array.isArray(
        creator.latestAudio
      )
        ? creator.latestAudio
        : [];

    const replays =
      Array.isArray(
        creator.replays
      )
        ? creator.replays
        : [];

    const upcoming =
      Array.isArray(
        creator.upcoming
      )
        ? creator.upcoming
        : [];

    return (
      <div className="lb-page elx-social-page batch1-creator-profile">
        <ListenerModal
          open={confirm}
          size="small"
          title={`Unfollow ${creator.name}?`}
          subtitle="You may see fewer updates from this creator."
          onClose={() =>
            !followBusy &&
            setConfirm(false)
          }
          footer={
            <>
              <button
                type="button"
                className="lb-button"
                disabled={followBusy}
                onClick={() =>
                  setConfirm(false)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="lb-button danger"
                disabled={followBusy}
                onClick={unfollow}
              >
                {followBusy
                  ? "Removing..."
                  : "Unfollow"}
              </button>
            </>
          }
        />

        <button
          type="button"
          className="elx-back"
          onClick={() =>
            navigate(-1)
          }
        >
          <FaArrowLeft />
          Back
        </button>

        <section className="elx-profile-hero">
          <div className="elx-profile-main">
            <span className="elx-big-avatar batch1-profile-avatar">
              {creator.avatar ? (
                <img
                  src={creator.avatar}
                  alt=""
                />
              ) : (
                creator.initials
              )}
            </span>

            <div>
              <small>
                CREATOR
              </small>

              <h1>
                {creator.name}
              </h1>

              <p>
                {creator.category}
              </p>

              <em>
                {creator.handle}
              </em>
            </div>
          </div>

          <button
            type="button"
            className={`elx-follow ${
              following
                ? "following"
                : ""
            }`}
            disabled={followBusy}
            onClick={follow}
          >
            {following ? (
              <>
                <FaCheck />
                Following
              </>
            ) : (
              <>
                + Follow
              </>
            )}
          </button>
        </section>

        <div className="elx-profile-stats">
          <div>
            <strong>
              {compactNumber(
                Number(
                  creator.followers
                ) +
                (
                  following &&
                  !backendCreator
                    ? 1
                    : 0
                )
              )}
            </strong>
            <span>
              Followers
            </span>
          </div>

          <div>
            <strong>
              {creator.audioCount || 0}
            </strong>
            <span>
              Audio
            </span>
          </div>

          <div>
            <strong>
              {creator.replayCount || 0}
            </strong>
            <span>
              Replays
            </span>
          </div>
        </div>

        <section className="elx-about">
          <h2>
            About
          </h2>
          <p>
            {creator.bio}
          </p>
        </section>

        {live && (
          <section className="elx-social-section">
            <h2>
              Live Now
            </h2>

            <article className="elx-feature-live">
              <span>
                <FaBroadcastTower />
              </span>

              <div>
                <small>
                  LIVE NOW
                </small>
                <strong>
                  {live.title}
                </strong>
                <p>
                  {compactNumber(
                    live.listenerCount
                  )}{" "}
                  listening
                </p>
              </div>

              <button
                type="button"
                className="lb-button primary"
                onClick={() =>
                  navigate(
                    `/listen/live/${live.id}`
                  )
                }
              >
                <FaPlay />
                Listen Live
              </button>
            </article>
          </section>
        )}

        {station && (
          <section className="elx-social-section">
            <h2>
              Station
            </h2>

            <button
              type="button"
              className="elx-station-link"
              onClick={() =>
                navigate(
                  `/listen/stations/${station.id}`
                )
              }
            >
              <span>
                <FaHeadphones />
              </span>

              <div>
                <strong>
                  {station.name}
                </strong>
                <small>
                  {station.description}
                </small>
              </div>

              <em>
                Open station →
              </em>
            </button>
          </section>
        )}

        {latestAudio.length > 0 && (
          <section className="elx-social-section">
            <h2>
              Latest Audio
            </h2>
            <AudioRows
              items={latestAudio}
            />
          </section>
        )}

        {replays.length > 0 && (
          <section className="elx-social-section">
            <h2>
              Replays
            </h2>
            <AudioRows
              items={replays}
            />
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="elx-social-section">
            <h2>
              Upcoming
            </h2>

            <div className="elx-upcoming-grid">
              {upcoming.map(
                (item) => (
                  <article
                    key={item.id}
                  >
                    <span>
                      {item.day}
                    </span>
                    <strong>
                      {item.title}
                    </strong>
                    <small>
                      {item.time}
                    </small>
                  </article>
                )
              )}
            </div>
          </section>
        )}
      </div>
    );
  };

export const ListenerStationProfile =
  () => {
    const {
      stationId,
    } =
      useParams();

    const navigate =
      useNavigate();

    const station =
      getStation(
        stationId
      );

    const creator =
      station
        ? getCreator(
            station.creatorId
          )
        : null;

    const live =
      station
        ? getStationLive(
            station.id
          )
        : null;

    const [
      following,
      setFollowing,
    ] = useState(
      station
        ? mockSocial.isFollowingStation(
            station.id
          )
        : false
    );

    if (
      !station
    ) {
      return (
        <div className="lb-page">
          <div className="lb-empty">
            <h2>
              Station not found
            </h2>

            <button
              type="button"
              className="lb-button"
              onClick={() =>
                navigate(
                  "/listen/stations"
                )
              }
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="lb-page elx-social-page">
        <button
          type="button"
          className="elx-back"
          onClick={() =>
            navigate(
              "/listen/stations"
            )
          }
        >
          <FaArrowLeft />
          Stations
        </button>

        <section className="elx-profile-hero station">
          <div className="elx-profile-main">
            <span className="elx-big-avatar station">
              <FaHeadphones />
            </span>

            <div>
              <small>
                STATION
              </small>

              <h1>
                {
                  station.name
                }
              </h1>

              <p>
                {
                  station.category
                }
              </p>

              <button
                type="button"
                className="elx-creator-link"
                onClick={() =>
                  navigate(
                    `/listen/creator/${creator.id}`
                  )
                }
              >
                by{" "}
                {
                  creator.name
                }
              </button>
            </div>
          </div>

          <button
            type="button"
            className={`elx-follow ${
              following
                ? "following"
                : ""
            }`}
            onClick={() =>
              setFollowing(
                mockSocial.toggleStation(
                  station.id
                )
              )
            }
          >
            {following ? (
              <>
                <FaCheck />
                Following
              </>
            ) : (
              <>
                +
                Follow Station
              </>
            )}
          </button>
        </section>

        <div className="elx-profile-stats">
          <div>
            <strong>
              {compactNumber(
                station.followers +
                  (following
                    ? 1
                    : 0)
              )}
            </strong>

            <span>
              Followers
            </span>
          </div>

          <div>
            <strong>
              {
                station.audioCount
              }
            </strong>

            <span>
              Audio
            </span>
          </div>

          <div>
            <strong>
              {
                station.broadcastCount
              }
            </strong>

            <span>
              Broadcasts
            </span>
          </div>
        </div>

        <section className="elx-about">
          <h2>
            About this station
          </h2>

          <p>
            {
              station.description
            }
          </p>
        </section>

        {live && (
          <section className="elx-social-section">
            <h2>
              Live Now
            </h2>

            <article className="elx-feature-live">
              <span>
                <FaBroadcastTower />
              </span>

              <div>
                <small>
                  LIVE NOW
                </small>

                <strong>
                  {
                    live.title
                  }
                </strong>

                <p>
                  {compactNumber(
                    live.listenerCount
                  )}{" "}
                  listening
                </p>
              </div>

              <button
                type="button"
                className="lb-button primary"
                onClick={() =>
                  navigate(
                    `/listen/live/${live.id}`
                  )
                }
              >
                <FaPlay />
                Listen Live
              </button>
            </article>
          </section>
        )}

        <section className="elx-social-section">
          <h2>
            Latest Audio
          </h2>

          <AudioRows
            items={
              station.latestAudio
            }
          />
        </section>

        <section className="elx-social-section">
          <h2>
            Replays
          </h2>

          <AudioRows
            items={
              station.replays
            }
          />
        </section>

        <section className="elx-social-section">
          <h2>
            Schedule
          </h2>

          <div className="elx-schedule">
            {station.schedule.map(
              (
                item
              ) => (
                <article
                  key={
                    item.id
                  }
                >
                  <span>
                    <FaClock />
                  </span>

                  <div>
                    <strong>
                      {
                        item.title
                      }
                    </strong>

                    <small>
                      {
                        item.day
                      }{" "}
                      •{" "}
                      {
                        item.time
                      }
                    </small>
                  </div>
                </article>
              )
            )}
          </div>
        </section>
      </div>
    );
  };

export const ListenerNotifications =
  () => {
    const navigate =
      useNavigate();

    const [
      version,
      setVersion,
    ] = useState(
      0
    );

    const notifications =
      useMemo(
        () =>
          mockSocial.getNotifications(),
        [version]
      );

    const unread =
      notifications.filter(
        (
          item
        ) =>
          !item.read
      ).length;

    return (
      <div className="lb-page elx-social-page">
        <header className="lb-page-header">
          <div>
            <div className="lb-page-heading">
              <h1>
                Notifications
              </h1>
            </div>

            <p>
              Live alerts,
              schedules and new
              audio from Echoo.
            </p>
          </div>

          {unread >
            0 && (
            <button
              type="button"
              className="lb-button"
              onClick={() => {
                mockSocial.markAllNotificationsRead();

                setVersion(
                  (
                    value
                  ) =>
                    value +
                    1
                );
              }}
            >
              <FaCheck />
              Mark all read
            </button>
          )}
        </header>

        <div className="elx-notification-summary">
          <span>
            <FaBell />
          </span>

          <div>
            <strong>
              {
                unread
              }
            </strong>

            <small>
              unread
              notifications
            </small>
          </div>
        </div>

        <div className="elx-notifications">
          {notifications.map(
            (
              item
            ) => (
              <button
                type="button"
                key={
                  item.id
                }
                className={`elx-notification ${
                  item.read
                    ? "read"
                    : ""
                }`}
                onClick={() => {
                  mockSocial.markNotificationRead(
                    item.id
                  );

                  setVersion(
                    (
                      value
                    ) =>
                      value +
                      1
                  );

                  navigate(
                    item.target
                  );
                }}
              >
                <span className="elx-notification-icon">
                  {item.type ===
                  "live" ? (
                    <FaBroadcastTower />
                  ) : item.type ===
                    "schedule" ? (
                    <FaClock />
                  ) : (
                    <FaHeadphones />
                  )}
                </span>

                <span className="elx-notification-copy">
                  <strong>
                    {
                      item.title
                    }
                  </strong>

                  <small>
                    {
                      item.message
                    }
                  </small>
                </span>

                <span className="elx-notification-time">
                  {
                    item.time
                  }
                </span>

                {!item.read && (
                  <i />
                )}
              </button>
            )
          )}
        </div>
      </div>
    );
  };