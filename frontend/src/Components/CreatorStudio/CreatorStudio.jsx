import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import "./CreatorStudio.css";

import {
  FaHome,
  FaFileAlt,
  FaBroadcastTower,
  FaMicrophone,
  FaCalendarAlt,
  FaUsers,
  FaChartBar,
  FaCog,
  FaBell,
  FaHeadphones,
  FaPlay,
  FaUserFriends,
  FaBolt,
  FaCloudUploadAlt,
  FaChevronRight,
  FaChevronDown,
  FaTrash,
  FaTimes,
  FaMusic,
  FaGlobe,
  FaLock,
  FaSpinner,
  FaExclamationCircle,
  FaSignOutAlt,
} from "react-icons/fa";

import echooLogo from "../Assets/logo.png";

import studioService from "../../services/studioService";
import CreatorStudioHome from "./CreatorStudioHome";
import CreatorContentWorkspace from "./CreatorContentWorkspace";
import CreatorLiveWorkspace from "./CreatorLiveConnectedWorkspace";
import CreatorStationsWorkspace from "./CreatorStationsWorkspace";
import CreatorScheduleWorkspace from "./CreatorScheduleWorkspace";
import CreatorAudienceWorkspace from "./CreatorAudienceWorkspace";
import CreatorAnalyticsWorkspace from "./CreatorAnalyticsConnectedWorkspace";
import CreatorSettingsWorkspace from "./CreatorSettingsWorkspace";
import "./CreatorStudio.identity.css";


const getStoredJson = (
  key,
  fallback = {}
) => {
  try {
    return JSON.parse(
      localStorage.getItem(
        key
      ) || JSON.stringify(
        fallback
      )
    );
  } catch {
    return fallback;
  }
};


const formatNumber = (
  number
) => {
  const value =
    Number(number) || 0;

  return new Intl.NumberFormat(
    "en-US"
  ).format(value);
};


const formatDate = (
  date
) => {
  if (!date) {
    return "—";
  }

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return "—";
  }

  return parsed.toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
};


const CreatorStudio = () => {
  const [
    activeNav,
    setActiveNav,
  ] = useState("Home");

  const [
    dashboard,
    setDashboard,
  ] = useState(null);

  const [
    content,
    setContent,
  ] = useState(null);

  const [
    audience,
    setAudience,
  ] = useState(null);

  const [
    analytics,
    setAnalytics,
  ] = useState(null);

  const [
    analyticsPeriod,
    setAnalyticsPeriod,
  ] = useState("30d");

  const [
    contentPage,
    setContentPage,
  ] = useState(1);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    notice,
    setNotice,
  ] = useState("");

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const [
    uploadOpen,
    setUploadOpen,
  ] = useState(false);

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    deletingId,
    setDeletingId,
  ] = useState("");

  const [
    uploadForm,
    setUploadForm,
  ] = useState({
    file: null,
    title: "",
    description: "",
    genre: "Other",
    tags: "",
    isPublic: true,
  });


  const creatorSetup =
    getStoredJson(
      "creatorSetup",
      {}
    );

  const user =
    getStoredJson(
      "user",
      {}
    );


  const isOrganization =
    creatorSetup.type ===
      "organization" ||
    user.creatorProfile
      ?.creatorType ===
      "organization";


  const studioName =
    isOrganization
      ? creatorSetup.name ||
        creatorSetup
          .organizationName ||
        user.creatorProfile
          ?.organizationName ||
        user.displayName ||
        "Creator Studio"
      : user.displayName ||
        user.fullname ||
        user.name ||
        user.username ||
        "Creator Studio";


  const studioType =
    isOrganization
      ? "Organization"
      : "Individual Creator";


  const initial =
    studioName &&
    studioName.length > 0
      ? studioName
          .charAt(0)
          .toUpperCase()
      : "E";


  const navItems = [
    {
      name: "Home",
      icon: <FaHome />,
    },
    {
      name: "Content",
      icon: <FaFileAlt />,
    },
    {
      name: "Stations",
      icon: (
        <FaBroadcastTower />
      ),
    },
    {
      name: "Live",
      icon: <FaMicrophone />,
    },
    {
      name: "Schedule",
      icon: <FaCalendarAlt />,
    },
    {
      name: "Audience",
      icon: <FaUsers />,
    },
    {
      name: "Analytics",
      icon: <FaChartBar />,
    },
    {
      name: "Settings",
      icon: <FaCog />,
    },
  ];


  const genres = [
    "Pop",
    "Rock",
    "Hip-Hop",
    "Electronic",
    "Jazz",
    "Classical",
    "R&B",
    "Country",
    "Metal",
    "Reggae",
    "Podcast",
    "Spiritual",
    "Educational",
    "Comedy",
    "Storytelling",
    "Other",
  ];


  useEffect(() => {
    let active = true;

    const loadPage =
      async () => {
        setLoading(true);
        setError("");
        setNotice("");

        try {
          if (
            activeNav ===
            "Home"
          ) {
            const [
              dashboardResponse,
              audienceResponse,
            ] =
              await Promise.all([
                studioService
                  .getDashboard(),

                studioService
                  .getAudience(),
              ]);

            if (!active) {
              return;
            }

            setDashboard(
              dashboardResponse
                ?.data || {}
            );

            setAudience(
              audienceResponse
                ?.data || {}
            );
          }


          if (
            activeNav ===
            "Content"
          ) {
            const response =
              await studioService
                .getContent({
                  page:
                    contentPage,
                  limit: 20,
                });

            if (!active) {
              return;
            }

            setContent(
              response?.data || {
                tracks: [],
                pagination: {},
              }
            );
          }


          if (
            activeNav ===
            "Audience"
          ) {
            const response =
              await studioService
                .getAudience();

            if (!active) {
              return;
            }

            setAudience(
              response?.data || {}
            );
          }


          if (
            activeNav ===
            "Analytics"
          ) {
            const response =
              await studioService
                .getAnalytics(
                  analyticsPeriod
                );

            if (!active) {
              return;
            }

            setAnalytics(
              response?.data || {}
            );
          }
        } catch (requestError) {
          if (!active) {
            return;
          }

          console.error(
            "Creator Studio request failed:",
            requestError
          );

          setError(
            requestError?.message ||
              "Could not load Creator Studio data."
          );
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

    loadPage();

    return () => {
      active = false;
    };
  }, [
    activeNav,
    analyticsPeriod,
    contentPage,
    refreshKey,
  ]);


  const handleCreatorLogout = () => {
    localStorage.removeItem(
      "accessToken"
    );

    localStorage.removeItem(
      "refreshToken"
    );

    localStorage.removeItem(
      "token"
    );

    localStorage.removeItem(
      "user"
    );

    localStorage.removeItem(
      "profileImage"
    );

    localStorage.removeItem(
      "profileBio"
    );

    localStorage.removeItem(
      "echooRole"
    );

    localStorage.removeItem(
      "echooProfileCompleted"
    );

    localStorage.removeItem(
      "echooOnboardingCompleted"
    );

    localStorage.removeItem(
      "creatorSetup"
    );

    sessionStorage.clear();

    window.location.replace(
      "/"
    );
  };


  const realPlays =
    Number(
      dashboard
        ?.totalPlays
    ) || 0;


  const realFollowers =
    Number(
      audience
        ?.totalFollowers
    ) || 0;


  const realListeners = 0;


  const realEngagement =
    realPlays > 0 &&
    realFollowers > 0
      ? Number(
          (
            (
              realPlays /
              realFollowers
            ) *
            100
          ).toFixed(1)
        )
      : 0;


  const recentContent =
    Array.isArray(
      dashboard
        ?.recentContent
    )
      ? dashboard
          .recentContent
      : [];


  const upcomingSchedule =
    Array.isArray(
      dashboard
        ?.upcomingSchedule
    )
      ? dashboard
          .upcomingSchedule
      : [];


  const contentTracks =
    Array.isArray(
      content?.tracks
    )
      ? content.tracks
      : [];


  const contentPagination =
    content?.pagination ||
    {};


  const analyticsTracks =
    Array.isArray(
      analytics?.tracks
    )
      ? analytics.tracks
      : [];


  const analyticsSummary =
    analytics?.summary || {
      totalTracks: 0,
      totalPlays: 0,
      totalLikes: 0,
      averagePlays: 0,
    };


  const headerContent =
    useMemo(() => {
      const headings = {
        Home: {
          title:
            "Welcome to your Studio",
          subtitle:
            "Here’s what’s happening with your content.",
        },

        Content: {
          title: "Your Content",
          subtitle:
            "Manage the audio you have published on Echoo.",
        },

        Stations: {
          title: "Stations",
          subtitle:
            "Create and manage your audio stations.",
        },

        Live: {
          title: "Live",
          subtitle:
            "Broadcast live audio to your audience.",
        },

        Schedule: {
          title: "Schedule",
          subtitle:
            "Manage upcoming broadcasts and events.",
        },

        Audience: {
          title: "Audience",
          subtitle:
            "Understand the people following your content.",
        },

        Analytics: {
          title: "Analytics",
          subtitle:
            "Review the performance of your Echoo content.",
        },

        Settings: {
          title:
            "Creator Settings",
          subtitle:
            "Manage your Creator Studio preferences.",
        },
      };

      return (
        headings[
          activeNav
        ] ||
        headings.Home
      );
    }, [activeNav]);


  const openUpload =
    () => {
      setError("");
      setNotice("");

      const creatorPreferences =
        getStoredJson(
          "echoo-creator-settings-v1",
          {
            defaultPublic: true,
          }
        );

      setUploadForm(
        (current) => ({
          ...current,

          isPublic:
            creatorPreferences
              .defaultPublic !==
            false,
        })
      );

      setUploadOpen(true);
    };


  const closeUpload =
    () => {
      if (uploading) {
        return;
      }

      setUploadOpen(false);
    };


  const resetUploadForm =
    () => {
      setUploadForm({
        file: null,
        title: "",
        description: "",
        genre: "Other",
        tags: "",
        isPublic: true,
      });
    };


  const handleUploadChange =
    (event) => {
      const {
        name,
        value,
        checked,
        files,
        type,
      } = event.target;

      if (
        name === "file"
      ) {
        const file =
          files?.[0] ||
          null;

        setUploadForm(
          (current) => ({
            ...current,
            file,

            title:
              current.title ||
              (
                file?.name
                  ?.replace(
                    /\.[^/.]+$/,
                    ""
                  ) || ""
              ),
          })
        );

        return;
      }

      setUploadForm(
        (current) => ({
          ...current,

          [name]:
            type ===
            "checkbox"
              ? checked
              : value,
        })
      );
    };


  const handleUploadSubmit =
    async (event) => {
      event.preventDefault();

      if (
        !uploadForm.file
      ) {
        setError(
          "Please choose an audio file."
        );

        return;
      }

      if (
        !uploadForm.title
          .trim()
      ) {
        setError(
          "Please enter a title."
        );

        return;
      }

      try {
        setUploading(true);
        setError("");
        setNotice("");

        const tags =
          uploadForm.tags
            .split(",")
            .map(
              (tag) =>
                tag.trim()
            )
            .filter(Boolean);

        await studioService
          .uploadAudio({
            file:
              uploadForm.file,

            title:
              uploadForm.title,

            description:
              uploadForm
                .description,

            genre:
              uploadForm.genre,

            tags,

            isPublic:
              uploadForm
                .isPublic,
          });

        resetUploadForm();

        setUploadOpen(
          false
        );

        setNotice(
          "Audio uploaded successfully."
        );

        setRefreshKey(
          (value) =>
            value + 1
        );
      } catch (
        uploadError
      ) {
        console.error(
          "Upload failed:",
          uploadError
        );

        setError(
          uploadError
            ?.message ||
            "Could not upload audio."
        );
      } finally {
        setUploading(false);
      }
    };


  const handleDelete =
    async (
      audioId,
      title
    ) => {
      const confirmed =
        window.confirm(
          `Delete "${
            title ||
            "this audio"
          }"?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setDeletingId(
          audioId
        );

        setError("");
        setNotice("");

        await studioService
          .deleteAudio(
            audioId
          );

        setNotice(
          "Audio deleted successfully."
        );

        setRefreshKey(
          (value) =>
            value + 1
        );
      } catch (
        deleteError
      ) {
        console.error(
          "Delete failed:",
          deleteError
        );

        setError(
          deleteError
            ?.message ||
            "Could not delete audio."
        );
      } finally {
        setDeletingId("");
      }
    };


  const renderLoading =
    () => {
      return (
        <div className="studio-loading-state">
          <FaSpinner />

          <strong>
            Loading Creator Studio
          </strong>

          <span>
            Getting your latest
            data...
          </span>
        </div>
      );
    };


  const renderHome =
    () => {
      return (
        <>
          <section className="studio-metrics">
            <div className="metric-card">
              <div className="metric-icon">
                <FaHeadphones />
              </div>

              <div>
                <span>
                  Listeners
                </span>

                <h2>
                  {formatNumber(
                    realListeners
                  )}
                </h2>

                <p>
                  Listener analytics
                  not available yet
                </p>
              </div>
            </div>


            <div className="metric-card">
              <div className="metric-icon">
                <FaPlay />
              </div>

              <div>
                <span>
                  Plays
                </span>

                <h2>
                  {formatNumber(
                    realPlays
                  )}
                </h2>

                <p>
                  {realPlays > 0
                    ? "Total content plays"
                    : "No plays yet"}
                </p>
              </div>
            </div>


            <div className="metric-card">
              <div className="metric-icon">
                <FaUserFriends />
              </div>

              <div>
                <span>
                  Followers
                </span>

                <h2>
                  {formatNumber(
                    realFollowers
                  )}
                </h2>

                <p>
                  {realFollowers >
                  0
                    ? "People following you"
                    : "No followers yet"}
                </p>
              </div>
            </div>


            <div className="metric-card">
              <div className="metric-icon">
                <FaBolt />
              </div>

              <div>
                <span>
                  Engagement
                </span>

                <h2>
                  {
                    realEngagement
                  }
                  %
                </h2>

                <p>
                  {realEngagement >
                  0
                    ? "Based on current activity"
                    : "No engagement yet"}
                </p>
              </div>
            </div>
          </section>


          <section className="studio-quick-actions">
            <button
              type="button"
              className="quick-action-card"
              onClick={() =>
                setActiveNav(
                  "Live"
                )
              }
            >
              <div className="quick-action-icon">
                <FaBroadcastTower />
              </div>

              <div className="quick-action-content">
                <h3>
                  Start Broadcast
                </h3>

                <p>
                  Go live and connect
                  with your audience.
                </p>
              </div>

              <FaChevronRight
                className="quick-arrow"
              />
            </button>


            <button
              type="button"
              className="quick-action-card"
              onClick={
                openUpload
              }
            >
              <div className="quick-action-icon">
                <FaCloudUploadAlt />
              </div>

              <div className="quick-action-content">
                <h3>
                  Upload Audio
                </h3>

                <p>
                  Share new episodes
                  or content.
                </p>
              </div>

              <FaChevronRight
                className="quick-arrow"
              />
            </button>


            <button
              type="button"
              className="quick-action-card"
              onClick={() =>
                setActiveNav(
                  "Stations"
                )
              }
            >
              <div className="quick-action-icon">
                <FaMicrophone />
              </div>

              <div className="quick-action-content">
                <h3>
                  Create Station
                </h3>

                <p>
                  Build a station and
                  curate your sound.
                </p>
              </div>

              <FaChevronRight
                className="quick-arrow"
              />
            </button>
          </section>


          <section className="studio-dashboard-grid">
            <div className="dashboard-panel recent-panel">
              <div className="panel-header">
                <h3>
                  Recent Content
                </h3>

                <button
                  type="button"
                  onClick={() =>
                    setActiveNav(
                      "Content"
                    )
                  }
                >
                  View All
                </button>
              </div>


              {recentContent
                .length >
              0 ? (
                <div className="recent-content-list">
                  {recentContent.map(
                    (
                      track
                    ) => (
                      <div
                        className="recent-content-row"
                        key={
                          track.id
                        }
                      >
                        <div className="recent-content-icon">
                          <FaMusic />
                        </div>

                        <div className="recent-content-info">
                          <strong>
                            {
                              track.title
                            }
                          </strong>

                          <span>
                            {formatDate(
                              track.date
                            )}
                            {" • "}
                            {
                              track.duration
                            }
                          </span>
                        </div>

                        <div className="recent-content-stats">
                          <span>
                            <FaPlay />

                            {formatNumber(
                              track.plays
                            )}
                          </span>

                          <span>
                            {
                              track.likes ||
                              0
                            }{" "}
                            likes
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="studio-empty-state">
                  <div className="empty-icon">
                    <FaCloudUploadAlt />
                  </div>

                  <h3>
                    No content yet
                  </h3>

                  <p>
                    Upload your first
                    audio content to
                    get started.
                  </p>

                  <button
                    type="button"
                    onClick={
                      openUpload
                    }
                  >
                    Upload Audio
                  </button>
                </div>
              )}
            </div>


            <div className="dashboard-panel growth-panel">
              <div className="panel-header">
                <h3>
                  Audience Growth
                </h3>

                <span>
                  Last 30 Days
                </span>
              </div>

              <div className="growth-content">
                <h2>
                  {formatNumber(
                    realFollowers
                  )}
                </h2>

                <p>
                  Followers
                </p>

                <div className="growth-divider"></div>

                <span>
                  {realFollowers >
                  0
                    ? "Your current follower total."
                    : "Audience growth history will appear when the backend starts recording growth over time."}
                </span>
              </div>
            </div>


            <div className="dashboard-panel schedule-panel">
              <div className="panel-header">
                <h3>
                  Upcoming Schedule
                </h3>

                <button
                  type="button"
                  onClick={() =>
                    setActiveNav(
                      "Schedule"
                    )
                  }
                >
                  View Calendar
                </button>
              </div>


              {upcomingSchedule
                .length >
              0 ? (
                <div className="schedule-list">
                  {upcomingSchedule.map(
                    (
                      event,
                      index
                    ) => (
                      <div
                        className="schedule-item"
                        key={
                          event.id ||
                          index
                        }
                      >
                        <FaCalendarAlt />

                        <div>
                          <strong>
                            {
                              event.title
                            }
                          </strong>

                          <span>
                            {formatDate(
                              event.date
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="schedule-empty">
                  <FaCalendarAlt />

                  <h3>
                    No upcoming
                    events
                  </h3>

                  <p>
                    Your scheduled
                    broadcasts will
                    appear here once
                    scheduling is
                    available.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveNav(
                        "Schedule"
                      )
                    }
                  >
                    View Schedule
                  </button>
                </div>
              )}
            </div>
          </section>
        </>
      );
    };


  const renderContent =
    () => {
      if (loading) {
        return renderLoading();
      }

      return (
        <section className="studio-data-section">
          <div className="studio-section-toolbar">
            <div>
              <h2>
                Published Audio
              </h2>

              <p>
                {
                  contentPagination
                    .total ||
                  0
                }{" "}
                audio items
              </p>
            </div>

            <button
              type="button"
              className="studio-primary-action"
              onClick={
                openUpload
              }
            >
              <FaCloudUploadAlt />

              Upload Audio
            </button>
          </div>


          {contentTracks
            .length ===
          0 ? (
            <div className="studio-large-empty">
              <div>
                <FaCloudUploadAlt />
              </div>

              <h3>
                No content yet
              </h3>

              <p>
                Upload your first
                audio file to begin
                building your Echoo
                catalogue.
              </p>

              <button
                type="button"
                onClick={
                  openUpload
                }
              >
                Upload Audio
              </button>
            </div>
          ) : (
            <>
              <div className="studio-table-wrap">
                <table className="studio-table">
                  <thead>
                    <tr>
                      <th>
                        Audio
                      </th>

                      <th>
                        Genre
                      </th>

                      <th>
                        Duration
                      </th>

                      <th>
                        Plays
                      </th>

                      <th>
                        Likes
                      </th>

                      <th>
                        Visibility
                      </th>

                      <th>
                        Published
                      </th>

                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {contentTracks.map(
                      (
                        track
                      ) => (
                        <tr
                          key={
                            track.id
                          }
                        >
                          <td>
                            <div className="studio-track-cell">
                              <span>
                                <FaMusic />
                              </span>

                              <strong>
                                {
                                  track.title
                                }
                              </strong>
                            </div>
                          </td>

                          <td>
                            {
                              track.genre ||
                              "Other"
                            }
                          </td>

                          <td>
                            {
                              track.duration ||
                              "0:00"
                            }
                          </td>

                          <td>
                            {formatNumber(
                              track.plays
                            )}
                          </td>

                          <td>
                            {formatNumber(
                              track.likes
                            )}
                          </td>

                          <td>
                            <span
                              className={`visibility-badge ${
                                track.isPublic
                                  ? "public"
                                  : "private"
                              }`}
                            >
                              {track.isPublic ? (
                                <FaGlobe />
                              ) : (
                                <FaLock />
                              )}

                              {track.isPublic
                                ? "Public"
                                : "Private"}
                            </span>
                          </td>

                          <td>
                            {formatDate(
                              track.createdAt
                            )}
                          </td>

                          <td>
                            <button
                              type="button"
                              className="studio-delete-button"
                              disabled={
                                deletingId ===
                                track.id
                              }
                              onClick={() =>
                                handleDelete(
                                  track.id,
                                  track.title
                                )
                              }
                            >
                              {deletingId ===
                              track.id ? (
                                <FaSpinner className="spin-icon" />
                              ) : (
                                <FaTrash />
                              )}
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>


              {Number(
                contentPagination
                  .totalPages
              ) > 1 && (
                <div className="studio-pagination">
                  <button
                    type="button"
                    disabled={
                      contentPage <=
                      1
                    }
                    onClick={() =>
                      setContentPage(
                        (
                          page
                        ) =>
                          Math.max(
                            1,
                            page -
                              1
                          )
                      )
                    }
                  >
                    Previous
                  </button>

                  <span>
                    Page{" "}
                    {
                      contentPage
                    }{" "}
                    of{" "}
                    {
                      contentPagination
                        .totalPages
                    }
                  </span>

                  <button
                    type="button"
                    disabled={
                      contentPage >=
                      Number(
                        contentPagination
                          .totalPages
                      )
                    }
                    onClick={() =>
                      setContentPage(
                        (
                          page
                        ) =>
                          page +
                          1
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      );
    };


  const renderAudience =
    () => {
      if (loading) {
        return renderLoading();
      }

      const topListeners =
        audience
          ?.topListeners || {
          total: 0,
          average: 0,
          peak: 0,
        };

      const demographics =
        audience
          ?.demographics || {
          topCountries: [],
          topCities: [],
          ageRanges: [],
        };

      return (
        <section className="studio-data-section">
          <div className="audience-summary-grid">
            <div className="audience-summary-card">
              <span>
                Total Followers
              </span>

              <strong>
                {formatNumber(
                  audience
                    ?.totalFollowers
                )}
              </strong>

              <p>
                People currently
                following your
                creator profile.
              </p>
            </div>


            <div className="audience-summary-card">
              <span>
                Top Listeners
              </span>

              <strong>
                {formatNumber(
                  topListeners
                    .total
                )}
              </strong>

              <p>
                Listener ranking
                data is not
                available yet.
              </p>
            </div>


            <div className="audience-summary-card">
              <span>
                Average
              </span>

              <strong>
                {formatNumber(
                  topListeners
                    .average
                )}
              </strong>

              <p>
                Average listener
                analytics.
              </p>
            </div>


            <div className="audience-summary-card">
              <span>
                Peak
              </span>

              <strong>
                {formatNumber(
                  topListeners
                    .peak
                )}
              </strong>

              <p>
                Peak listener
                analytics.
              </p>
            </div>
          </div>


          <div className="audience-detail-grid">
            <div className="dashboard-panel">
              <div className="panel-header">
                <h3>
                  Top Countries
                </h3>
              </div>

              {demographics
                .topCountries
                ?.length >
              0 ? (
                <div className="simple-data-list">
                  {demographics
                    .topCountries
                    .map(
                      (
                        item,
                        index
                      ) => (
                        <div
                          key={
                            item.country ||
                            index
                          }
                        >
                          <span>
                            {item.country ||
                              item.name}
                          </span>

                          <strong>
                            {formatNumber(
                              item.count ||
                                item.value
                            )}
                          </strong>
                        </div>
                      )
                    )}
                </div>
              ) : (
                <div className="panel-no-data">
                  <FaGlobe />

                  <strong>
                    No country data
                    yet
                  </strong>

                  <span>
                    Geographic
                    analytics are
                    not being
                    returned by the
                    backend yet.
                  </span>
                </div>
              )}
            </div>


            <div className="dashboard-panel">
              <div className="panel-header">
                <h3>
                  Top Cities
                </h3>
              </div>

              {demographics
                .topCities
                ?.length >
              0 ? (
                <div className="simple-data-list">
                  {demographics
                    .topCities
                    .map(
                      (
                        item,
                        index
                      ) => (
                        <div
                          key={
                            item.city ||
                            index
                          }
                        >
                          <span>
                            {item.city ||
                              item.name}
                          </span>

                          <strong>
                            {formatNumber(
                              item.count ||
                                item.value
                            )}
                          </strong>
                        </div>
                      )
                    )}
                </div>
              ) : (
                <div className="panel-no-data">
                  <FaUsers />

                  <strong>
                    No city data
                    yet
                  </strong>

                  <span>
                    City analytics
                    will appear
                    when the
                    backend starts
                    recording them.
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      );
    };


  const renderAnalytics =
    () => {
      if (loading) {
        return renderLoading();
      }

      return (
        <section className="studio-data-section">
          <div className="analytics-toolbar">
            <div>
              <h2>
                Performance
                Overview
              </h2>

              <p>
                Review the real
                play and like
                totals currently
                available from the
                backend.
              </p>
            </div>

            <div className="analytics-periods">
              {[
                "7d",
                "30d",
                "90d",
                "12m",
              ].map(
                (period) => (
                  <button
                    type="button"
                    key={
                      period
                    }
                    className={
                      analyticsPeriod ===
                      period
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setAnalyticsPeriod(
                        period
                      )
                    }
                  >
                    {period ===
                    "12m"
                      ? "12 Months"
                      : period}
                  </button>
                )
              )}
            </div>
          </div>


          <div className="analytics-summary-grid">
            <div>
              <span>
                Total Tracks
              </span>

              <strong>
                {formatNumber(
                  analyticsSummary
                    .totalTracks
                )}
              </strong>
            </div>

            <div>
              <span>
                Total Plays
              </span>

              <strong>
                {formatNumber(
                  analyticsSummary
                    .totalPlays
                )}
              </strong>
            </div>

            <div>
              <span>
                Total Likes
              </span>

              <strong>
                {formatNumber(
                  analyticsSummary
                    .totalLikes
                )}
              </strong>
            </div>

            <div>
              <span>
                Average Plays
              </span>

              <strong>
                {formatNumber(
                  analyticsSummary
                    .averagePlays
                )}
              </strong>
            </div>
          </div>


          <div className="dashboard-panel analytics-content-panel">
            <div className="panel-header">
              <h3>
                Content
                Performance
              </h3>

              <span>
                {
                  analyticsPeriod
                }
              </span>
            </div>


            {analyticsTracks
              .length >
            0 ? (
              <div className="studio-table-wrap analytics-table-wrap">
                <table className="studio-table">
                  <thead>
                    <tr>
                      <th>
                        Track
                      </th>

                      <th>
                        Plays
                      </th>

                      <th>
                        Likes
                      </th>

                      <th>
                        Duration
                      </th>

                      <th>
                        Published
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {analyticsTracks.map(
                      (
                        track
                      ) => (
                        <tr
                          key={
                            track.id
                          }
                        >
                          <td>
                            <div className="studio-track-cell">
                              <span>
                                <FaMusic />
                              </span>

                              <strong>
                                {
                                  track.title
                                }
                              </strong>
                            </div>
                          </td>

                          <td>
                            {formatNumber(
                              track.plays
                            )}
                          </td>

                          <td>
                            {formatNumber(
                              track.likes
                            )}
                          </td>

                          <td>
                            {
                              track.duration ||
                              "0:00"
                            }
                          </td>

                          <td>
                            {formatDate(
                              track.createdAt
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="panel-no-data">
                <FaChartBar />

                <strong>
                  No analytics
                  yet
                </strong>

                <span>
                  Content
                  performance will
                  appear after you
                  publish and your
                  audience starts
                  listening.
                </span>
              </div>
            )}
          </div>
        </section>
      );
    };


  const renderPending =
    (
      icon,
      title,
      message
    ) => {
      return (
        <section className="studio-pending-page">
          <div className="pending-icon">
            {icon}
          </div>

          <span className="pending-badge">
            Backend pending
          </span>

          <h2>
            {title}
          </h2>

          <p>
            {message}
          </p>

          <button
            type="button"
            onClick={() =>
              setActiveNav(
                "Home"
              )
            }
          >
            Back to Studio
          </button>
        </section>
      );
    };


  const renderCurrentPage =
    () => {
      if (
        activeNav ===
        "Home"
      ) {
        return (
          <CreatorStudioHome
            studioName={
              studioName
            }
            studioType={
              studioType
            }
            profileImage={
              user.avatar ||
              user.profileImage ||
              localStorage.getItem(
                "profileImage"
              ) ||
              null
            }
            followers={
              realFollowers
            }
            onUpload={
              openUpload
            }
            onNavigate={(
              page
            ) => {
              setError("");
              setNotice("");

              setActiveNav(
                page
              );
            }}
          />
        );
      }


      if (
        activeNav ===
        "Content"
      ) {
        return (
          <CreatorContentWorkspace
            tracks={
              contentTracks
            }
            loading={
              loading
            }
            page={
              contentPage
            }
            pagination={
              contentPagination
            }
            deletingId={
              deletingId
            }
            onUpload={
              openUpload
            }
            onDelete={
              handleDelete
            }
            onPageChange={
              setContentPage
            }
          />
        );
      }


      if (
        activeNav ===
        "Stations"
      ) {
        return (
          <CreatorStationsWorkspace
            studioName={
              studioName
            }
          />
        );
      }


      if (
        activeNav ===
        "Live"
      ) {
        return (
          <CreatorLiveWorkspace
            studioName={
              studioName
            }
            profileImage={
              user.avatar ||
              user.profileImage ||
              localStorage.getItem(
                "profileImage"
              ) ||
              null
            }
          />
        );
      }


      if (
        activeNav ===
        "Schedule"
      ) {
        return (
          <CreatorScheduleWorkspace
            onNavigate={(
              page
            ) => {
              setError("");
              setNotice("");

              setActiveNav(
                page
              );
            }}
          />
        );
      }


      if (
        activeNav ===
        "Audience"
      ) {
        return (
          <CreatorAudienceWorkspace
            audience={
              audience
            }
            loading={
              loading
            }
          />
        );
      }


      if (
        activeNav ===
        "Analytics"
      ) {
        return (
          <CreatorAnalyticsWorkspace
            analytics={
              analytics
            }
            period={
              analyticsPeriod
            }
            onPeriodChange={
              setAnalyticsPeriod
            }
            loading={
              loading
            }
          />
        );
      }


      if (
        activeNav ===
        "Settings"
      ) {
        return (
          <CreatorSettingsWorkspace
            user={
              user
            }
            studioName={
              studioName
            }
            studioType={
              studioType
            }
          />
        );
      }


      return (
        <CreatorStudioHome
          studioName={
            studioName
          }
          studioType={
            studioType
          }
          profileImage={
            user.avatar ||
            user.profileImage ||
            null
          }
          followers={
            realFollowers
          }
          onUpload={
            openUpload
          }
          onNavigate={
            setActiveNav
          }
        />
      );
    };


  return (
    <div className="studio-page">
      <aside className="studio-sidebar">
        <div className="studio-brand">
          <img
            src={echooLogo}
            alt="Echoo"
            className="studio-logo"
          />

          <div>
            <h2>
              Echoo
            </h2>

            <span>
              Creator Studio
            </span>
          </div>
        </div>


        <nav className="studio-navigation">
          {navItems.map(
            (item) => (
              <button
                type="button"
                key={
                  item.name
                }
                className={`studio-nav-item ${
                  activeNav ===
                  item.name
                    ? "active"
                    : ""
                }`}
                onClick={() => {
                  setError("");
                  setNotice("");

                  setActiveNav(
                    item.name
                  );
                }}
              >
                <span className="studio-nav-icon">
                  {item.icon}
                </span>

                <span>
                  {item.name}
                </span>
              </button>
            )
          )}
        </nav>


        <div className="studio-sidebar-profile">
          <div className="sidebar-avatar">
            {initial}
          </div>

          <div className="sidebar-profile-text">
            <strong>
              {studioName}
            </strong>

            <span>
              {studioType}
            </span>
          </div>

          <button
            type="button"
            className="studio-sidebar-logout"
            onClick={handleCreatorLogout}
            aria-label="Log out of Echoo"
            title="Log out"
          >
            <FaSignOutAlt />

            <span>
              Log out
            </span>
          </button>
        </div>
      </aside>


      <main id="echoo-main-content" tabIndex="-1" className="studio-main">
        <header className="studio-topbar">
          <div>
            <h1>
              {
                headerContent.title
              }
            </h1>

            <p>
              {
                headerContent.subtitle
              }
            </p>
          </div>


          <div className="studio-top-actions">
            <button
              type="button"
              className="notification-button"
            >
              <FaBell />
            </button>


            <button
              type="button"
              className="studio-account-button"
            >
              <div className="top-avatar">
                {initial}
              </div>

              <div>
                <strong>
                  {studioName}
                </strong>

                <span>
                  View Profile
                </span>
              </div>

              <FaChevronDown />
            </button>
          </div>
        </header>


        {error && (
          <div className="studio-alert error">
            <FaExclamationCircle />

            <span>
              {error}
            </span>

            <button
              type="button"
              onClick={() =>
                setError("")
              }
            >
              <FaTimes />
            </button>
          </div>
        )}


        {notice && (
          <div className="studio-alert success">
            <FaCloudUploadAlt />

            <span>
              {notice}
            </span>

            <button
              type="button"
              onClick={() =>
                setNotice("")
              }
            >
              <FaTimes />
            </button>
          </div>
        )}


        <div className="studio-view">
          {renderCurrentPage()}
        </div>


        <footer className="studio-footer">
          <span>
            © 2026 Echoo.
            All rights
            reserved.
          </span>

          <div>
            <button
              type="button"
            >
              Help Center
            </button>

            <button
              type="button"
            >
              Terms
            </button>

            <button
              type="button"
            >
              Privacy
            </button>
          </div>
        </footer>
      </main>


      {uploadOpen && (
        <div
          className="studio-modal-overlay"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeUpload();
            }
          }}
        >
          <div className="studio-upload-modal">
            <div className="upload-modal-header">
              <div>
                <h2>
                  Upload Audio
                </h2>

                <p>
                  Add a new audio
                  item to your
                  Echoo Creator
                  Studio.
                </p>
              </div>

              <button
                type="button"
                className="upload-close-button"
                onClick={
                  closeUpload
                }
                disabled={
                  uploading
                }
              >
                <FaTimes />
              </button>
            </div>


            <form
              onSubmit={
                handleUploadSubmit
              }
              className="studio-upload-form"
            >
              <label className="studio-upload-drop">
                <input
                  type="file"
                  name="file"
                  accept="audio/*"
                  onChange={
                    handleUploadChange
                  }
                  hidden
                />

                <div>
                  <FaCloudUploadAlt />
                </div>

                <strong>
                  {uploadForm
                    .file
                    ?.name ||
                    "Choose audio file"}
                </strong>

                <span>
                  Click to select
                  an audio file
                </span>
              </label>


              <div className="studio-form-field">
                <label
                  htmlFor="studio-upload-title"
                >
                  Title
                </label>

                <input
                  id="studio-upload-title"
                  type="text"
                  name="title"
                  value={
                    uploadForm.title
                  }
                  onChange={
                    handleUploadChange
                  }
                  placeholder="Audio title"
                  maxLength={
                    150
                  }
                  required
                />
              </div>


              <div className="studio-form-grid">
                <div className="studio-form-field">
                  <label
                    htmlFor="studio-upload-genre"
                  >
                    Genre
                  </label>

                  <select
                    id="studio-upload-genre"
                    name="genre"
                    value={
                      uploadForm.genre
                    }
                    onChange={
                      handleUploadChange
                    }
                  >
                    {genres.map(
                      (
                        genre
                      ) => (
                        <option
                          key={
                            genre
                          }
                          value={
                            genre
                          }
                        >
                          {
                            genre
                          }
                        </option>
                      )
                    )}
                  </select>
                </div>


                <div className="studio-form-field">
                  <label
                    htmlFor="studio-upload-tags"
                  >
                    Tags
                  </label>

                  <input
                    id="studio-upload-tags"
                    type="text"
                    name="tags"
                    value={
                      uploadForm.tags
                    }
                    onChange={
                      handleUploadChange
                    }
                    placeholder="faith, worship"
                  />
                </div>
              </div>


              <div className="studio-form-field">
                <label
                  htmlFor="studio-upload-description"
                >
                  Description
                </label>

                <textarea
                  id="studio-upload-description"
                  name="description"
                  value={
                    uploadForm.description
                  }
                  onChange={
                    handleUploadChange
                  }
                  placeholder="Tell listeners about this audio..."
                  maxLength={
                    500
                  }
                />
              </div>


              <label className="studio-visibility-option">
                <input
                  type="checkbox"
                  name="isPublic"
                  checked={
                    uploadForm.isPublic
                  }
                  onChange={
                    handleUploadChange
                  }
                />

                <span className="visibility-checkbox"></span>

                <div>
                  <strong>
                    Make this audio
                    public
                  </strong>

                  <small>
                    Public audio can
                    appear in
                    listener
                    discovery.
                  </small>
                </div>
              </label>


              <div className="upload-modal-actions">
                <button
                  type="button"
                  className="upload-cancel"
                  onClick={
                    closeUpload
                  }
                  disabled={
                    uploading
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="upload-submit"
                  disabled={
                    uploading ||
                    !uploadForm.file ||
                    !uploadForm
                      .title
                      .trim()
                  }
                >
                  {uploading ? (
                    <>
                      <FaSpinner className="spin-icon" />

                      Uploading...
                    </>
                  ) : (
                    <>
                      <FaCloudUploadAlt />

                      Upload Audio
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


export default CreatorStudio;