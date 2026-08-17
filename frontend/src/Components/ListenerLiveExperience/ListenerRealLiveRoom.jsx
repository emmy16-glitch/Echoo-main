/* eslint-disable react-hooks/preserve-manual-memoization, react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  FaArrowLeft,
  FaBroadcastTower,
  FaClock,
  FaComments,
  FaHeadphones,
  FaPaperPlane,
  FaSyncAlt,
  FaThumbtack,
  FaTrash,
  FaUsers,
} from "react-icons/fa";

import batch3Service from "../../services/batch3Service";
import batch4Service from "../../services/batch4Service";
import LiveKitListenerPlayer from "./LiveKitListenerPlayer";

import {
  getMockMediaForKey,
} from "../../services/mockMediaService.js";

import "../../styles/echoo-batch3.css";
import "../../styles/echoo-batch4.css";

const REACTION_OPTIONS = [
  "👍",
  "❤️",
  "🔥",
  "👏",
];

const readCurrentUser =
  () => {
    try {
      const value =
        JSON.parse(
          localStorage.getItem(
            "user"
          ) || "{}"
        );

      return {
        ...value,

        id:
          value.id ||
          value._id ||
          value.userId ||
          null,

        username:
          value.username ||
          "",

        displayName:
          value.displayName ||
          value.fullname ||
          value.username ||
          "",

        avatar:
          value.avatar ||
          value.profileImage ||
          null,
      };
    } catch {
      return {
        id: null,
        username: "",
        displayName: "",
        avatar: null,
      };
    }
  };

const sameId = (
  first,
  second
) => {
  if (
    !first ||
    !second
  ) {
    return false;
  }

  return (
    String(first) ===
    String(second)
  );
};

const formatMessageTime = (
  value
) => {
  if (!value) {
    return "";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date
    .toLocaleTimeString(
      [],
      {
        hour:
          "numeric",
        minute:
          "2-digit",
      }
    );
};

const groupReactions = (
  reactions = []
) => {
  const groups =
    new Map();

  reactions.forEach(
    (
      reaction
    ) => {
      if (
        !reaction?.emoji
      ) {
        return;
      }

      groups.set(
        reaction.emoji,
        (
          groups.get(
            reaction.emoji
          ) || 0
        ) + 1
      );
    }
  );

  return Array.from(
    groups.entries()
  ).map(
    ([
      emoji,
      count,
    ]) => ({
      emoji,
      count,
    })
  );
};

const ChatMessage = ({
  message,
  currentUser,
  isBroadcastOwner,
  onReact,
  onDelete,
  onPin,
  busyId,
}) => {
  const own =
    sameId(
      message.userId,
      currentUser.id
    );

  const reactions =
    groupReactions(
      message.reactions
    );

  const canDelete =
    own ||
    isBroadcastOwner;

  return (
    <article
      className={`b4-message ${
        own
          ? "own"
          : ""
      } ${
        message.isPinned
          ? "pinned"
          : ""
      }`}
    >
      <div className="b4-message-avatar">
        {message.avatar ? (
          <img
            src={
              message.avatar
            }
            alt=""
          />
        ) : (
          <span>
            {(
              message.displayName ||
              "E"
            )
              .slice(
                0,
                1
              )
              .toUpperCase()}
          </span>
        )}
      </div>

      <div className="b4-message-main">
        <header>
          <strong>
            {
              message.displayName
            }
          </strong>

          <time>
            {formatMessageTime(
              message.createdAt
            )}
          </time>

          {message.isPinned && (
            <span className="b4-pinned-label">
              <FaThumbtack />
              Pinned
            </span>
          )}
        </header>

        <p>
          {
            message.content
          }
        </p>

        {reactions.length >
          0 && (
          <div className="b4-reaction-counts">
            {reactions.map(
              (
                reaction
              ) => (
                <button
                  type="button"
                  key={
                    reaction.emoji
                  }
                  disabled={
                    busyId ===
                    message.id
                  }
                  onClick={() =>
                    onReact(
                      message,
                      reaction.emoji
                    )
                  }
                >
                  {
                    reaction.emoji
                  }{" "}
                  {
                    reaction.count
                  }
                </button>
              )
            )}
          </div>
        )}

        <div className="b4-message-actions">
          {REACTION_OPTIONS.map(
            (
              emoji
            ) => (
              <button
                type="button"
                key={
                  emoji
                }
                title={`React ${emoji}`}
                disabled={
                  busyId ===
                  message.id
                }
                onClick={() =>
                  onReact(
                    message,
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

          {isBroadcastOwner && (
            <button
              type="button"
              className="text-action"
              disabled={
                busyId ===
                message.id
              }
              onClick={() =>
                onPin(
                  message
                )
              }
            >
              <FaThumbtack />

              {message.isPinned
                ? "Unpin"
                : "Pin"}
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              className="text-action danger"
              disabled={
                busyId ===
                message.id
              }
              onClick={() =>
                onDelete(
                  message
                )
              }
            >
              <FaTrash />
              Delete
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

const ListenerRealLiveRoom =
  () => {
    const {
      broadcastId,
    } =
      useParams();

    const navigate =
      useNavigate();

    const currentUser =
      useMemo(
        () =>
          readCurrentUser(),
        []
      );

    const chatEndRef =
      useRef(
        null
      );

    const [
      broadcast,
      setBroadcast,
    ] = useState(null);

    const [
      messages,
      setMessages,
    ] = useState([]);

    const [
      pinned,
      setPinned,
    ] = useState([]);

    const [
      stats,
      setStats,
    ] = useState({
      totalMessages: 0,
      uniqueUsers: 0,
      recentMessages: 0,
      activeNow: 0,
    });

    const [
      text,
      setText,
    ] = useState("");

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      chatLoading,
      setChatLoading,
    ] = useState(true);

    const [
      sending,
      setSending,
    ] = useState(false);

    const [
      busyId,
      setBusyId,
    ] = useState(null);

    const [
      error,
      setError,
    ] = useState("");

    const [
      notice,
      setNotice,
    ] = useState("");

    const [
      legacy,
      setLegacy,
    ] = useState(false);

    const isBroadcastOwner =
      sameId(
        broadcast
          ?.creatorId,
        currentUser.id
      );

    const chatAvailable =
      broadcast?.status ===
        "live" ||
      broadcast?.status ===
        "scheduled";

    const loadMessages =
      useCallback(
        async ({
          silent = false,
        } = {}) => {
          try {
            if (
              !silent
            ) {
              setChatLoading(
                true
              );
            }

            const [
              messageResult,
              pinnedResult,
              statsResult,
            ] =
              await Promise.all([
                batch4Service
                  .getMessages(
                    broadcastId,
                    {
                      page: 1,
                      limit: 100,
                    }
                  ),

                batch4Service
                  .getPinned(
                    broadcastId
                  ),

                batch4Service
                  .getStats(
                    broadcastId
                  ),
              ]);

            setMessages(
              Array.isArray(
                messageResult
                  ?.data
              )
                ? messageResult.data
                : []
            );

            setPinned(
              Array.isArray(
                pinnedResult
                  ?.data
              )
                ? pinnedResult.data
                : []
            );

            setStats({
              totalMessages:
                Number(
                  statsResult
                    ?.data
                    ?.totalMessages
                ) || 0,

              uniqueUsers:
                Number(
                  statsResult
                    ?.data
                    ?.uniqueUsers
                ) || 0,

              recentMessages:
                Number(
                  statsResult
                    ?.data
                    ?.recentMessages
                ) || 0,

              activeNow:
                Number(
                  statsResult
                    ?.data
                    ?.activeNow
                ) || 0,
            });
          } catch (
            loadError
          ) {
            console.error(
              "Live Chat load:",
              loadError
            );

            if (
              !silent
            ) {
              setError(
                loadError?.message ||
                "Could not load Live Chat."
              );
            }
          } finally {
            if (
              !silent
            ) {
              setChatLoading(
                false
              );
            }
          }
        },
        [
          broadcastId,
        ]
      );

    useEffect(() => {
      let active =
        true;

      const load =
        async () => {
          try {
            setLoading(
              true
            );

            const response =
              await batch3Service
                .getBroadcast(
                  broadcastId
                );

            if (
              active &&
              response?.data
            ) {
              setBroadcast(
                response.data
              );
            }
          } catch (
            loadError
          ) {
            console.error(
              loadError
            );

            if (
              active
            ) {
              setLegacy(
                true
              );
            }
          } finally {
            if (
              active
            ) {
              setLoading(
                false
              );
            }
          }
        };

      load();

      return () => {
        active =
          false;
      };
    }, [
      broadcastId,
    ]);

    useEffect(() => {
      if (
        !broadcast?.id
      ) {
        return;
      }

      loadMessages();

      if (
        !chatAvailable
      ) {
        return;
      }

      const interval =
        window.setInterval(
          () => {
            loadMessages({
              silent:
                true,
            });
          },
          5001
        );

      return () =>
        window.clearInterval(
          interval
        );
    }, [
      broadcast?.id,
      chatAvailable,
      loadMessages,
    ]);

    useEffect(() => {
      if (
        chatLoading
      ) {
        return;
      }

      chatEndRef.current
        ?.scrollIntoView({
          behavior:
            "smooth",
          block:
            "nearest",
        });
    }, [
      messages.length,
      chatLoading,
    ]);

    const send =
      async (
        event
      ) => {
        event.preventDefault();

        const content =
          text.trim();

        if (
          !content ||
          sending ||
          !chatAvailable
        ) {
          return;
        }

        try {
          setSending(
            true
          );

          setError(
            ""
          );

          setNotice(
            ""
          );

          const response =
            await batch4Service
              .sendMessage(
                broadcastId,
                content
              );

          if (
            response?.data
          ) {
            setMessages(
              (
                current
              ) => [
                ...current,
                response.data,
              ]
            );
          }

          setText(
            ""
          );

          await loadMessages({
            silent: true,
          });
        } catch (
          sendError
        ) {
          setError(
            sendError?.message ||
            "Message could not be sent."
          );
        } finally {
          setSending(
            false
          );
        }
      };

    const react =
      async (
        message,
        emoji
      ) => {
        if (
          !message?.id ||
          busyId
        ) {
          return;
        }

        try {
          setBusyId(
            message.id
          );

          setError(
            ""
          );

          await batch4Service
            .react(
              message.id,
              emoji
            );

          await loadMessages({
            silent: true,
          });
        } catch (
          actionError
        ) {
          setError(
            actionError?.message ||
            "Reaction could not be updated."
          );
        } finally {
          setBusyId(
            null
          );
        }
      };

    const pin =
      async (
        message
      ) => {
        if (
          !message?.id ||
          !isBroadcastOwner ||
          busyId
        ) {
          return;
        }

        try {
          setBusyId(
            message.id
          );

          setError(
            ""
          );

          await batch4Service
            .pin(
              message.id
            );

          await loadMessages({
            silent: true,
          });

          setNotice(
            message.isPinned
              ? "Message unpinned."
              : "Message pinned."
          );
        } catch (
          actionError
        ) {
          setError(
            actionError?.message ||
            "Message could not be pinned."
          );
        } finally {
          setBusyId(
            null
          );
        }
      };

    const remove =
      async (
        message
      ) => {
        if (
          !message?.id ||
          busyId
        ) {
          return;
        }

        const confirmed =
          window.confirm(
            "Delete this message?"
          );

        if (
          !confirmed
        ) {
          return;
        }

        try {
          setBusyId(
            message.id
          );

          setError(
            ""
          );

          await batch4Service
            .deleteMessage(
              message.id
            );

          setMessages(
            (
              current
            ) =>
              current.filter(
                (
                  item
                ) =>
                  item.id !==
                  message.id
              )
          );

          await loadMessages({
            silent: true,
          });

          setNotice(
            "Message deleted."
          );
        } catch (
          actionError
        ) {
          setError(
            actionError?.message ||
            "Message could not be deleted."
          );
        } finally {
          setBusyId(
            null
          );
        }
      };

    if (
      legacy
    ) {
      return (
        <div className="b4-room">
          <header className="b4-room-topbar">
            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/live"
                )
              }
            >
              <FaArrowLeft />
              Live
            </button>
          </header>

          <div className="echoo-cleanup-state">
            <strong>
              Broadcast unavailable.
            </strong>

            <span>
              Echoo could not load this broadcast. No demo broadcast has been substituted.
            </span>
          </div>
        </div>
      );
    }

    if (
      loading
    ) {
      return (
        <div className="b3-listener-page">
          <div className="b3-big-empty">
            Loading broadcast...
          </div>
        </div>
      );
    }

    if (
      !broadcast
    ) {
      return (
        <div className="b4-room">
          <header className="b4-room-topbar">
            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/live"
                )
              }
            >
              <FaArrowLeft />
              Live
            </button>
          </header>

          <div className="echoo-cleanup-state">
            <strong>
              Broadcast unavailable.
            </strong>

            <span>
              Echoo could not load this broadcast. No demo broadcast has been substituted.
            </span>
          </div>
        </div>
      );
    }

    const artwork =
      broadcast.coverArt ||
      getMockMediaForKey(
        broadcast.id ||
          broadcast.title,
        "broadcasts"
      );

    const isLive =
      broadcast.status ===
      "live";

    const isScheduled =
      broadcast.status ===
      "scheduled";

    return (
      <div className="b4-room">
        <header className="b4-room-topbar">
          <button
            type="button"
            onClick={() =>
              navigate(
                "/listen/live"
              )
            }
          >
            <FaArrowLeft />
            Live
          </button>

          <div className="b4-room-status">
            <span
              className={
                isLive
                  ? "b3-live-pill"
                  : "b3-status-pill"
              }
            >
              {isLive
                ? "LIVE"
                : broadcast.status}
            </span>

            <span>
              HTTP Chat connected
            </span>
          </div>
        </header>

        <main className="b4-room-main">
          <section className="b4-stage">
            <div className="b4-stage-art">
              {artwork ? (
                <img
                  src={
                    artwork
                  }
                  alt=""
                />
              ) : (
                <FaBroadcastTower />
              )}
            </div>

            <div className="b4-stage-copy">
              <span className="b3-kicker">
                {
                  broadcast.stationName
                }
              </span>

              <h1>
                {
                  broadcast.title
                }
              </h1>

              <p>
                {broadcast.description ||
                  "An Echoo broadcast."}
              </p>

              <div className="b4-broadcast-meta">
                <span>
                  <FaUsers />
                  {
                    broadcast.listenerCount
                  }{" "}
                  listening
                </span>

                <span>
                  <FaHeadphones />
                  {
                    broadcast.stationName
                  }
                </span>

                {broadcast.startTime && (
                  <span>
                    <FaClock />
                    {new Date(
                      broadcast.startTime
                    ).toLocaleString()}
                  </span>
                )}
              </div>

              {broadcast.stationId && (
                <button
                  type="button"
                  className="b4-view-station"
                  onClick={() =>
                    navigate(
                      `/listen/stations/${broadcast.stationId}`
                    )
                  }
                >
                  View station
                </button>
              )}

              {isLive && (
                <LiveKitListenerPlayer
                  broadcastId={
                    broadcast.id
                  }
                  isLive={
                    isLive
                  }
                />
              )}
            </div>
          </section>

          <aside className="b4-chat">
            <header className="b4-chat-header">
              <div>
                <FaComments />

                <div>
                  <strong>
                    Live Chat
                  </strong>

                  <span>
                    {
                      stats.totalMessages
                    }{" "}
                    messages ·{" "}
                    {
                      stats.uniqueUsers
                    }{" "}
                    participants
                  </span>
                </div>
              </div>

              <button
                type="button"
                title="Refresh chat"
                onClick={() =>
                  loadMessages()
                }
                disabled={
                  chatLoading
                }
              >
                <FaSyncAlt />
              </button>
            </header>

            <div className="b4-http-notice">
              <span className="b4-sync-dot" />

              Synced with the backend
              every 5 seconds.
              Realtime Socket.IO comes
              next.
            </div>

            {pinned.length >
              0 && (
              <section className="b4-pinned">
                <header>
                  <FaThumbtack />
                  Pinned
                </header>

                {pinned
                  .slice(
                    0,
                    2
                  )
                  .map(
                    (
                      message
                    ) => (
                      <div
                        key={
                          message.id
                        }
                      >
                        <strong>
                          {
                            message.displayName
                          }
                        </strong>

                        <p>
                          {
                            message.content
                          }
                        </p>
                      </div>
                    )
                  )}
              </section>
            )}

            {error && (
              <div className="b4-alert error">
                {error}
              </div>
            )}

            {notice && (
              <div className="b4-alert success">
                {notice}
              </div>
            )}

            <div className="b4-messages">
              {chatLoading ? (
                <div className="b4-chat-empty">
                  Loading conversation...
                </div>
              ) : messages.length ===
                0 ? (
                <div className="b4-chat-empty">
                  <FaComments />

                  <strong>
                    Be the first voice
                    in the room.
                  </strong>

                  <span>
                    Messages sent here
                    are stored in
                    Echoo's backend.
                  </span>
                </div>
              ) : (
                messages.map(
                  (
                    message
                  ) => (
                    <ChatMessage
                      key={
                        message.id
                      }
                      message={
                        message
                      }
                      currentUser={
                        currentUser
                      }
                      isBroadcastOwner={
                        isBroadcastOwner
                      }
                      onReact={
                        react
                      }
                      onDelete={
                        remove
                      }
                      onPin={
                        pin
                      }
                      busyId={
                        busyId
                      }
                    />
                  )
                )
              )}

              <div
                ref={
                  chatEndRef
                }
              />
            </div>

            <form
              className="b4-composer"
              onSubmit={
                send
              }
            >
              <textarea
                value={
                  text
                }
                maxLength={
                  500
                }
                disabled={
                  !chatAvailable ||
                  sending
                }
                placeholder={
                  isLive
                    ? "Say something..."
                    : isScheduled
                    ? "Join the conversation before it starts..."
                    : "Chat is closed for this broadcast."
                }
                onChange={(
                  event
                ) =>
                  setText(
                    event.target
                      .value
                  )
                }
                onKeyDown={(
                  event
                ) => {
                  if (
                    event.key ===
                      "Enter" &&
                    !event.shiftKey
                  ) {
                    event.preventDefault();

                    if (
                      text.trim()
                    ) {
                      event.currentTarget
                        .form
                        ?.requestSubmit();
                    }
                  }
                }}
              />

              <div className="b4-composer-footer">
                <span>
                  {
                    text.length
                  }
                  /500
                </span>

                <button
                  type="submit"
                  disabled={
                    !chatAvailable ||
                    sending ||
                    !text.trim()
                  }
                >
                  <FaPaperPlane />

                  {sending
                    ? "Sending..."
                    : "Send"}
                </button>
              </div>
            </form>
          </aside>
        </main>

        <footer className="b4-room-footer">
          <div>
            <strong>
              Backend chat:
            </strong>
            persisted
          </div>

          <div>
            <strong>
              Reactions:
            </strong>
            persisted
          </div>

          <div>
            <strong>
              Pin/Delete:
            </strong>
            persisted
          </div>

          <div>
            <strong>
              Presence:
            </strong>
            Socket.IO pending
          </div>
        </footer>
      </div>
    );
  };

export default ListenerRealLiveRoom;
