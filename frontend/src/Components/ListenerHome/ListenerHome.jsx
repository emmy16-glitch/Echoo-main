import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useOutletContext,
} from "react-router-dom";

import {
  FaArrowRight,
  FaHeadphones,
  FaPause,
  FaPlay,
} from "react-icons/fa";

import listenerService from "../../services/listenerService";
import audioService from "../../services/audioService";

import {
  getCreatorLive,
  getStationLive,
  hydrateLiveItem,
  mockBroadcasts,
  mockCreators,
  mockSocial,
  mockStations,
} from "../../services/listenerMockService";

import EchoSignal from "../EchooSystem/EchoSignal";
import EchoAmbient from "../EchooSystem/EchoAmbient";
import HorizontalDragRail from "../FigmaUI/HorizontalDragRail";

import "./ListenerHome.css";

const normalizeAudio = (
  response
) => {
  if (
    Array.isArray(
      response?.data
    )
  ) {
    return response.data;
  }

  if (
    Array.isArray(
      response?.data
        ?.tracks
    )
  ) {
    return response
      .data
      .tracks;
  }

  return [];
};

const getTrackId = (
  item
) =>
  item?.id ||
  item?._id ||
  item?.trackId ||
  null;

const getArtist = (
  item
) => {
  const artist =
    item?.artist;

  return (
    item?.artistName ||
    (
      typeof artist ===
      "string"
        ? artist
        : artist?.displayName ||
          artist?.username
    ) ||
    item?.subtitle ||
    item?.creatorName ||
    "Echoo Creator"
  );
};

const getArtwork = (
  item
) =>
  item?.coverArt ||
  item?.artwork ||
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

  const source =
    getArtwork(
      item
    ) ||
    item?.avatar ||
    item?.profileImage ||
    null;

  if (
    source &&
    !failed
  ) {
    return (
      <img
        src={source}
        alt=""
        draggable="false"
        onError={() =>
          setFailed(true)
        }
      />
    );
  }

  return (
    <span className="identity-fallback">
      {getInitials(
        name
      )}
    </span>
  );
};

const ListenerHome =
  () => {
    const navigate =
      useNavigate();

    const {
      playTrack,
      currentTrack,
      isPlaying,
      togglePlay,
    } =
      useOutletContext();

    const [
      dashboard,
      setDashboard,
    ] = useState(null);

    const [
      audioTracks,
      setAudioTracks,
    ] = useState([]);

    const [
      loading,
      setLoading,
    ] = useState(true);

    useEffect(() => {
      let mounted =
        true;

      const load =
        async () => {
          const [
            dashboardResult,
            audioResult,
          ] =
            await Promise.allSettled(
              [
                listenerService.getDashboard(),

                audioService.getAll({
                  public: true,
                  page: 1,
                  limit: 50,
                }),
              ]
            );

          if (!mounted) {
            return;
          }

          if (
            dashboardResult.status ===
            "fulfilled"
          ) {
            setDashboard(
              dashboardResult
                .value
                ?.data ||
              null
            );
          }

          if (
            audioResult.status ===
            "fulfilled"
          ) {
            setAudioTracks(
              normalizeAudio(
                audioResult.value
              )
            );
          }

          setLoading(false);
        };

      load();

      return () => {
        mounted =
          false;
      };
    }, []);

    const liveItems =
      useMemo(
        () => {
          const backend =
            Array.isArray(
              dashboard?.liveNow
            )
              ? dashboard.liveNow
              : [];

          const source =
            backend.length
              ? backend
              : mockBroadcasts;

          return source
            .map(
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
            .slice(
              0,
              8
            );
        },
        [
          dashboard,
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
                  item
                ) =>
                  Boolean(
                    item.live
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
                  item
                ) =>
                  Boolean(
                    item.live
                  )
              );

          const followed = [
            ...creators,
            ...stations,
          ];

          if (
            followed.length
          ) {
            return followed.slice(
              0,
              6
            );
          }

          return liveItems
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
                  `live-presence-${live.id || index}`,

                name:
                  live.subtitle ||
                  live.creatorName ||
                  "Echoo Live",

                entity:
                  live,

                live,
              })
            );
        },
        [
          liveItems,
        ]
      );

    const continueItems =
      useMemo(
        () => {
          const source =
            Array.isArray(
              dashboard
                ?.continueListening
            ) &&
            dashboard
              .continueListening
              .length
              ? dashboard
                  .continueListening
              : audioTracks;

          return source.slice(
            0,
            5
          );
        },
        [
          dashboard,
          audioTracks,
        ]
      );

    const channels =
      useMemo(
        () =>
          [
            ...mockCreators.map(
              (
                creator
              ) => ({
                ...creator,
                type:
                  "Creator",

                route:
                  `/listen/creator/${creator.id}`,
              })
            ),

            ...mockStations.map(
              (
                station
              ) => ({
                ...station,
                type:
                  "Station",

                route:
                  `/listen/stations/${station.id}`,
              })
            ),
          ].slice(
            0,
            8
          ),
        []
      );

    const play =
      (
        item,
        queue
      ) => {
        const id =
          getTrackId(
            item
          );

        if (
          (
            id &&
            currentTrack?.id ===
              id
          ) ||
          currentTrack?.title ===
            item.title
        ) {
          togglePlay();

          return;
        }

        playTrack(
          {
            ...item,

            id,

            title:
              item.title ||
              "Untitled Audio",

            subtitle:
              getArtist(
                item
              ),

            coverArt:
              getArtwork(
                item
              ),

            fileUrl:
              item.fileUrl ||
              null,

            genre:
              item.genre ||
              "Audio",
          },
          queue
        );
      };

    const playing =
      (
        item
      ) => {
        const id =
          getTrackId(
            item
          );

        return (
          isPlaying &&
          (
            (
              id &&
              currentTrack?.id ===
                id
            ) ||
            currentTrack?.title ===
              item.title
          )
        );
      };

    if (loading) {
      return (
        <div className="identity-home">
          <div className="identity-home-loading">
            <span />
            <span />
            <span />
          </div>
        </div>
      );
    }

    return (
      <div className="identity-home">
        <header className="identity-home-hero echoo-home-filled-hero">
          <EchoAmbient
            density="low"
            className="identity-home-ambient"
          />

          <div className="echoo-home-hero-copy">
            <span className="identity-kicker">
              ECHOO / NOW
            </span>

            <h1>
              Your world is
              talking.
            </h1>

            <p>
              Live voices,
              conversations and
              audio worth hearing
              right now.
            </p>

            <div className="echoo-home-hero-buttons">
              <button
                type="button"
                className="echoo-home-hero-primary"
                onClick={() =>
                  navigate(
                    `/listen/live/${
                      mockBroadcasts[0]?.id ||
                      "faith-talk-live"
                    }`
                  )
                }
              >
                Join what's live
                <FaArrowRight />
              </button>

              <button
                type="button"
                className="echoo-home-hero-secondary"
                onClick={() =>
                  navigate(
                    "/listen/stations"
                  )
                }
              >
                Browse stations
              </button>
            </div>
          </div>

          {mockBroadcasts[0] && (
            <article className="echoo-home-featured-card">
              <button
                type="button"
                className="echoo-home-featured-image"
                aria-label={`Open ${mockBroadcasts[0].title}`}
                onClick={() =>
                  navigate(
                    `/listen/live/${mockBroadcasts[0].id}`
                  )
                }
              >
                <img
                  src={
                    getArtwork(
                      mockBroadcasts[0]
                    ) ||
                    "/mock-media/broadcast-blood.png"
                  }
                  alt=""
                />

                <span className="echoo-home-featured-overlay" />

                <span className="echoo-home-live-pill">
                  <i />
                  LIVE
                </span>

                <span className="echoo-home-featured-count">
                  {Number(
                    mockBroadcasts[0]
                      .listenerCount ||
                    mockBroadcasts[0]
                      .listeners ||
                    0
                  ).toLocaleString()} listening
                </span>
              </button>

              <div className="echoo-home-featured-bottom">
                <div>
                  <small>
                    Featured live
                  </small>

                  <h2>
                    {
                      mockBroadcasts[0]
                        .title
                    }
                  </h2>

                  <p>
                    {
                      mockBroadcasts[0]
                        .subtitle
                    }
                  </p>
                </div>

                <button
                  type="button"
                  aria-label={`Join ${mockBroadcasts[0].title}`}
                  onClick={() =>
                    navigate(
                      `/listen/live/${mockBroadcasts[0].id}`
                    )
                  }
                >
                  <FaPlay />
                </button>
              </div>
            </article>
          )}
        </header>

        <section className="identity-section presence-section echoo-home-live-around">
          <div className="identity-section-heading echoo-home-live-heading">
            <div>
              <h2>
                Live around you
              </h2>

              <p>
                Voices happening
                now.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/live"
                )
              }
            >
              See all
              <FaArrowRight />
            </button>
          </div>

          <div className="echoo-home-live-cards">
            {mockBroadcasts
              .slice(
                0,
                3
              )
              .map(
                (
                  item,
                  index
                ) => {
                  const fallbacks = [
                    "/mock-media/broadcast-blood.png",
                    "/mock-media/broadcast-no-turning-back.png",
                    "/mock-media/broadcast-bible-study.png",
                  ];

                  return (
                    <article
                      key={
                        item.id
                      }
                      className="echoo-home-live-card"
                    >
                      <button
                        type="button"
                        className="echoo-home-live-card-image"
                        aria-label={`Open ${item.title}`}
                        onClick={() =>
                          navigate(
                            `/listen/live/${item.id}`
                          )
                        }
                      >
                        <img
                          src={
                            getArtwork(
                              item
                            ) ||
                            fallbacks[
                              index %
                              fallbacks.length
                            ]
                          }
                          alt=""
                        />

                        <span className="echoo-home-live-card-overlay" />

                        <span className="echoo-home-live-pill">
                          <i />
                          LIVE
                        </span>

                        <span className="echoo-home-live-card-count">
                          {Number(
                            item.listenerCount ||
                            item.listeners ||
                            0
                          ).toLocaleString()}
                          {" "}listening
                        </span>
                      </button>

                      <div className="echoo-home-live-card-body">
                        <div>
                          <h3>
                            {
                              item.title
                            }
                          </h3>

                          <p>
                            {
                              item.subtitle
                            }
                          </p>
                        </div>

                        <button
                          type="button"
                          className="echoo-home-live-card-open"
                          aria-label={`Join ${item.title}`}
                          onClick={() =>
                            navigate(
                              `/listen/live/${item.id}`
                            )
                          }
                        >
                          <FaArrowRight />
                        </button>
                      </div>
                    </article>
                  );
                }
              )}
          </div>
        </section>

        <section className="identity-section">
          <div className="identity-section-heading">
            <div>
              <h2>
                Continue listening
              </h2>

              <p>
                Pick up where you
                left off.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/history"
                )
              }
            >
              History
              <FaArrowRight />
            </button>
          </div>

          {continueItems.length ? (
            <div className="identity-continue-list">
              {continueItems.map(
                (
                  item,
                  index
                ) => (
                  <article
                    className="identity-continue-row"
                    key={
                      getTrackId(
                        item
                      ) ||
                      index
                    }
                  >
                    <div
                      className={`identity-continue-art art-${(index % 4) + 1}`}
                    >
                      <IdentityImage
                        item={
                          item
                        }
                        name={
                          item.title
                        }
                      />
                    </div>

                    <div className="identity-continue-copy">
                      <h3>
                        {item.title ||
                          "Untitled Audio"}
                      </h3>

                      <p>
                        {getArtist(
                          item
                        )}
                      </p>
                    </div>

                    <div className="identity-row-line" />

                    <button
                      type="button"
                      className="identity-round-play"
                      onClick={() =>
                        play(
                          item,
                          continueItems
                        )
                      }
                    >
                      {playing(
                        item
                      ) ? (
                        <FaPause />
                      ) : (
                        <FaPlay />
                      )}
                    </button>
                  </article>
                )
              )}
            </div>
          ) : (
            <div className="identity-empty-row">
              <FaHeadphones />

              <span>
                Start listening and
                your unfinished
                audio will appear
                here.
              </span>
            </div>
          )}
        </section>

        <section className="identity-section">
          <div className="identity-section-heading">
            <div>
              <h2>
                For you
              </h2>

              <p>
                New audio from
                across Echoo.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/listen/library"
                )
              }
            >
              Library
              <FaArrowRight />
            </button>
          </div>

          <HorizontalDragRail
            ariaLabel="Recommended audio"
            className="identity-audio-rail"
          >
            {audioTracks
              .slice(
                0,
                12
              )
              .map(
                (
                  item,
                  index
                ) => (
                  <article
                    className="identity-audio-item"
                    key={
                      getTrackId(
                        item
                      ) ||
                      index
                    }
                  >
                    <div
                      className={`identity-audio-art art-${(index % 4) + 1}`}
                    >
                      <IdentityImage
                        item={
                          item
                        }
                        name={
                          item.title
                        }
                      />

                      <button
                        type="button"
                        onClick={() =>
                          play(
                            item,
                            audioTracks
                          )
                        }
                      >
                        {playing(
                          item
                        ) ? (
                          <FaPause />
                        ) : (
                          <FaPlay />
                        )}
                      </button>
                    </div>

                    <h3>
                      {item.title ||
                        "Untitled Audio"}
                    </h3>

                    <p>
                      {getArtist(
                        item
                      )}
                    </p>
                  </article>
                )
              )}
          </HorizontalDragRail>
        </section>

        <section className="identity-section channels-section">
          <div className="identity-section-heading">
            <div>
              <h2>
                Voices to know
              </h2>

              <p>
                Creators and
                stations building
                their presence on
                Echoo.
              </p>
            </div>
          </div>

          <HorizontalDragRail
            ariaLabel="Creators and stations"
            className="identity-channel-rail"
          >
            {channels.map(
              (
                channel
              ) => (
                <button
                  type="button"
                  key={`${channel.type}-${channel.id}`}
                  className="identity-channel"
                  onClick={() =>
                    navigate(
                      channel.route
                    )
                  }
                >
                  <div className="identity-channel-avatar">
                    <IdentityImage
                      item={
                        channel
                      }
                      name={
                        channel.name
                      }
                    />
                  </div>

                  <h3>
                    {
                      channel.name
                    }
                  </h3>

                  <p>
                    {
                      channel.type
                    }
                  </p>
                </button>
              )
            )}
          </HorizontalDragRail>
        </section>
      </div>
    );
  };

export default ListenerHome;
