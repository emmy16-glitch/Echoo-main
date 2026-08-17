import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  FaArrowRight,
  FaBell,
  FaBroadcastTower,
  FaCheck,
  FaPlay,
  FaSyncAlt,
  FaUsers,
} from "react-icons/fa";

import listenerService from "../../services/listenerService";

import {
  compactNumber,
  getCreatorLive,
  getStationLive,
  hydrateLiveItem,
  mockBroadcasts,
  mockCreators,
  mockSocial,
} from "../../services/listenerMockService";

import EchoSignal from "../EchooSystem/EchoSignal";
import HorizontalDragRail from "../FigmaUI/HorizontalDragRail";

import "./ListenerLive.css";

const getArtwork = (
  item
) =>
  item?.artwork ||
  item?.coverArt ||
  item?.image ||
  item?.thumbnail ||
  null;

const getInitials = (
  value
) =>
  String(
    value ||
    "Echoo"
  )
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (
        word
      ) =>
        word
          .charAt(0)
          .toUpperCase()
    )
    .join("");

const IdentityImage = ({
  item,
  name,
}) => {
  const [
    failed,
    setFailed,
  ] = useState(false);

  const image =
    getArtwork(
      item
    ) ||
    item?.avatar ||
    item?.profileImage ||
    null;

  if (
    image &&
    !failed
  ) {
    return (
      <img
        src={image}
        alt=""
        draggable="false"
        onError={() =>
          setFailed(true)
        }
      />
    );
  }

  return (
    <span className="live-identity-initials">
      {getInitials(
        name
      )}
    </span>
  );
};

const ListenerLive =
  () => {
    const navigate =
      useNavigate();

    const [
      items,
      setItems,
    ] = useState([]);

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      refreshing,
      setRefreshing,
    ] = useState(false);

    const [
      category,
      setCategory,
    ] = useState(
      "All"
    );

    const [
      reminders,
      setReminders,
    ] = useState(
      new Set()
    );

    const load =
      useCallback(
        async (
          refresh =
            false
        ) => {
          if (
            refresh
          ) {
            setRefreshing(
              true
            );
          } else {
            setLoading(
              true
            );
          }

          try {
            const response =
              await listenerService.getDashboard();

            const backend =
              Array.isArray(
                response
                  ?.data
                  ?.liveNow
              )
                ? response
                    .data
                    .liveNow
                : [];

            const source =
              backend.length
                ? backend
                : mockBroadcasts;

            setItems(
              source.map(
                (
                  item,
                  index
                ) => ({
                  ...hydrateLiveItem(
                    item
                  ),
                  ...item,

                  id:
                    item.id ||
                    item._id ||
                    hydrateLiveItem(
                      item
                    )?.id ||
                    `live-${index}`,
                })
              )
            );
          } catch (
            error
          ) {
            console.error(
              "Live discovery:",
              error
            );

            setItems(
              mockBroadcasts
            );
          } finally {
            setLoading(
              false
            );

            setRefreshing(
              false
            );
          }
        },
        []
      );

    useEffect(() => {
      load();
    }, [load]);

    const categories =
      useMemo(
        () => [
          "All",
          ...Array.from(
            new Set(
              items
                .map(
                  (
                    item
                  ) =>
                    item.category ||
                    item.fullCategory
                )
                .filter(
                  Boolean
                )
            )
          ),
        ],
        [
          items,
        ]
      );

    const filtered =
      useMemo(
        () =>
          category ===
          "All"
            ? items
            : items.filter(
                (
                  item
                ) =>
                  (
                    item.category ||
                    item.fullCategory
                  ) ===
                  category
              ),
        [
          items,
          category,
        ]
      );

    const featured =
      filtered[0] ||
      null;

    const nearby =
      filtered.slice(
        1
      );

    const totalListeners =
      useMemo(
        () =>
          items.reduce(
            (
              total,
              item
            ) =>
              total +
              (
                Number(
                  item.listenerCount ||
                  item.listeners ||
                  0
                ) || 0
              ),
            0
          ),
        [
          items,
        ]
      );

    const presence =
      useMemo(
        () => {
          const creators =
            mockSocial
              .getFollowingCreators()
              .map(
                (
                  creator
                ) => ({
                  id:
                    `creator-${creator.id}`,

                  name:
                    creator.name,

                  entity:
                    creator,

                  live:
                    getCreatorLive(
                      creator.id
                    ),
                })
              )
              .filter(
                (
                  entry
                ) =>
                  Boolean(
                    entry.live
                  )
              );

          const stations =
            mockSocial
              .getFollowingStations()
              .map(
                (
                  station
                ) => ({
                  id:
                    `station-${station.id}`,

                  name:
                    station.name,

                  entity:
                    station,

                  live:
                    getStationLive(
                      station.id
                    ),
                })
              )
              .filter(
                (
                  entry
                ) =>
                  Boolean(
                    entry.live
                  )
              );

          const result = [
            ...creators,
            ...stations,
          ];

          if (
            result.length
          ) {
            return result.slice(
              0,
              7
            );
          }

          return items
            .slice(
              0,
              5
            )
            .map(
              (
                live,
                index
              ) => ({
                id:
                  `fallback-${live.id || index}`,

                name:
                  live.subtitle ||
                  live.creatorName ||
                  "Echoo",

                entity:
                  live,

                live,
              })
            );
        },
        [
          items,
        ]
      );

    const upcoming =
      useMemo(
        () =>
          mockCreators
            .flatMap(
              (
                creator
              ) =>
                (
                  creator.upcoming ||
                  []
                ).map(
                  (
                    event
                  ) => ({
                    ...event,

                    creatorName:
                      creator.name,

                    creatorId:
                      creator.id,
                  })
                )
            )
            .slice(
              0,
              8
            ),
        []
      );

    const toggleReminder =
      (
        id
      ) => {
        setReminders(
          (
            current
          ) => {
            const next =
              new Set(
                current
              );

            if (
              next.has(
                id
              )
            ) {
              next.delete(
                id
              );
            } else {
              next.add(
                id
              );
            }

            return next;
          }
        );
      };

    if (loading) {
      return (
        <div className="identity-live-page">
          <div className="identity-live-loading" />
        </div>
      );
    }

    return (
      <div className="identity-live-page">
        <header className="identity-live-header">
          <div>
            <span className="identity-live-kicker">
              LIVE ON ECHOO
            </span>

            <h1>
              Live now
            </h1>

            <p>
              {items.length}{" "}
              {items.length ===
              1
                ? "conversation"
                : "conversations"}{" "}
              happening ·{" "}
              {compactNumber(
                totalListeners
              )}{" "}
              listening
            </p>
          </div>

          <button
            type="button"
            className="identity-refresh"
            disabled={
              refreshing
            }
            onClick={() =>
              load(
                true
              )
            }
          >
            <FaSyncAlt
              className={
                refreshing
                  ? "spin"
                  : ""
              }
            />

            {refreshing
              ? "Refreshing"
              : "Refresh"}
          </button>
        </header>

        <div className="identity-live-filter-row">
          {categories.map(
            (
              item
            ) => (
              <button
                key={
                  item
                }
                type="button"
                className={
                  category ===
                  item
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setCategory(
                    item
                  )
                }
              >
                {item}
              </button>
            )
          )}
        </div>

        {featured ? (
          <section className="identity-featured-live">
            <div className="identity-featured-copy">
              <div className="identity-featured-meta">
                <span className="identity-live-tag">
                  <i />
                  LIVE
                </span>

                <span>
                  <FaUsers />
                  {compactNumber(
                    Number(
                      featured.listenerCount ||
                      featured.listeners ||
                      0
                    )
                  )}{" "}
                  listening
                </span>
              </div>

              <h2>
                {
                  featured.title
                }
              </h2>

              <p>
                {featured.description ||
                  featured.subtitle ||
                  "Join the conversation happening live on Echoo."}
              </p>

              <div className="identity-featured-host">
                <EchoSignal
                  size="md"
                  active
                />

                <span>
                  <strong>
                    {featured.subtitle ||
                      featured.creatorName ||
                      "Echoo Creator"}
                  </strong>

                  <small>
                    Broadcasting now
                  </small>
                </span>
              </div>

              <div className="identity-featured-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    navigate(
                      `/listen/live/${featured.id}`
                    )
                  }
                >
                  Join live
                  <FaArrowRight />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/listen/live/${featured.id}`
                    )
                  }
                >
                  View room
                </button>
              </div>
            </div>

            <div className="identity-featured-visual">
              {getArtwork(
                featured
              ) ? (
                <img
                  src={
                    getArtwork(
                      featured
                    )
                  }
                  alt=""
                  draggable="false"
                />
              ) : (
                <EchoSignal
                  size="xl"
                  active
                  speaking
                >
                  <div className="identity-featured-avatar">
                    <FaBroadcastTower />
                  </div>
                </EchoSignal>
              )}
            </div>
          </section>
        ) : (
          <div className="identity-live-empty">
            <EchoSignal
              size="lg"
            />

            <h2>
              Quiet for the moment
            </h2>

            <p>
              When a creator goes
              live, their signal
              will appear here.
            </p>
          </div>
        )}

        {presence.length >
          0 && (
          <section className="identity-live-section">
            <div className="identity-live-section-heading">
              <div>
                <h2>
                  People you follow
                  are live
                </h2>

                <p>
                  Step into a voice
                  you already know.
                </p>
              </div>
            </div>

            <div className="identity-live-presence">
              {presence.map(
                (
                  item
                ) => (
                  <button
                    type="button"
                    key={
                      item.id
                    }
                    onClick={() =>
                      navigate(
                        `/listen/live/${item.live.id}`
                      )
                    }
                  >
                    <EchoSignal
                      size="lg"
                      active
                    >
                      <div className="identity-live-person-avatar">
                        <IdentityImage
                          item={
                            item.entity
                          }
                          name={
                            item.name
                          }
                        />
                      </div>
                    </EchoSignal>

                    <strong>
                      {
                        item.name
                      }
                    </strong>

                    <span>
                      {item.live
                        ?.title ||
                        "Live now"}
                    </span>
                  </button>
                )
              )}
            </div>
          </section>
        )}

        {nearby.length >
          0 && (
          <section className="identity-live-section">
            <div className="identity-live-section-heading">
              <div>
                <h2>
                  Happening around
                  you
                </h2>

                <p>
                  More conversations
                  happening now.
                </p>
              </div>
            </div>

            <HorizontalDragRail
              ariaLabel="Live conversations"
              className="identity-live-around-rail"
            >
              {nearby.map(
                (
                  item,
                  index
                ) => (
                  <article
                    key={
                      item.id ||
                      index
                    }
                    className="identity-live-around-item"
                    onClick={() =>
                      navigate(
                        `/listen/live/${item.id}`
                      )
                    }
                  >
                    <div className="identity-live-around-top">
                      <span className="identity-live-tag">
                        <i />
                        LIVE
                      </span>

                      <span>
                        {compactNumber(
                          Number(
                            item.listenerCount ||
                            item.listeners ||
                            0
                          )
                        )}
                      </span>
                    </div>

                    <h3>
                      {
                        item.title
                      }
                    </h3>

                    <p>
                      {item.subtitle ||
                        item.creatorName ||
                        "Echoo Live"}
                    </p>

                    <div className="identity-live-around-bottom">
                      <EchoSignal
                        size="sm"
                        active
                      />

                      <button
                        type="button"
                        aria-label="Join live"
                      >
                        <FaPlay />
                      </button>
                    </div>
                  </article>
                )
              )}
            </HorizontalDragRail>
          </section>
        )}

        {upcoming.length >
          0 && (
          <section className="identity-live-section starting-soon">
            <div className="identity-live-section-heading">
              <div>
                <h2>
                  Starting soon
                </h2>

                <p>
                  Upcoming voices
                  worth returning
                  for.
                </p>
              </div>
            </div>

            <div className="identity-upcoming-list">
              {upcoming.map(
                (
                  event
                ) => {
                  const reminded =
                    reminders.has(
                      event.id
                    );

                  return (
                    <article
                      key={
                        event.id
                      }
                    >
                      <time>
                        {
                          event.time
                        }
                      </time>

                      <div>
                        <h3>
                          {
                            event.title
                          }
                        </h3>

                        <p>
                          {
                            event.creatorName
                          }{" "}
                          ·{" "}
                          {
                            event.day
                          }
                        </p>
                      </div>

                      <button
                        type="button"
                        className={
                          reminded
                            ? "reminded"
                            : ""
                        }
                        onClick={() =>
                          toggleReminder(
                            event.id
                          )
                        }
                      >
                        {reminded ? (
                          <>
                            <FaCheck />
                            Reminder set
                          </>
                        ) : (
                          <>
                            <FaBell />
                            Remind me
                          </>
                        )}
                      </button>
                    </article>
                  );
                }
              )}
            </div>
          </section>
        )}
      </div>
    );
  };

export default ListenerLive;
