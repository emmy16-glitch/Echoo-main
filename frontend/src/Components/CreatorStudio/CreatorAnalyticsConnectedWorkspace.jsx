import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  FaBroadcastTower,
  FaChartLine,
  FaHeadphones,
  FaPlay,
  FaSyncAlt,
  FaUsers,
} from "react-icons/fa";

import LegacyCreatorAnalyticsWorkspace from "./CreatorAnalyticsWorkspace";

import batch6Service from "../../services/batch6Service";

import "../../styles/echoo-batch6.css";

const PERIODS = [
  {
    id: "7d",
    label: "7 days",
  },
  {
    id: "30d",
    label: "30 days",
  },
  {
    id: "90d",
    label: "90 days",
  },
];

const number = (
  value
) =>
  new Intl.NumberFormat(
    "en-US"
  ).format(
    Number(value) || 0
  );

const CreatorAnalyticsConnectedWorkspace =
  (
    props
  ) => {
    const [
      period,
      setPeriod,
    ] = useState(
      props.period ||
      "30d"
    );

    const [
      data,
      setData,
    ] = useState(null);

    const [
      loading,
      setLoading,
    ] = useState(true);

    const [
      error,
      setError,
    ] = useState("");

    const load =
      useCallback(
        async (
          selectedPeriod =
            period
        ) => {
          try {
            setLoading(
              true
            );

            setError(
              ""
            );

            const response =
              await batch6Service
                .getTrustedAnalytics(
                  selectedPeriod
                );

            setData(
              response
            );
          } catch (
            loadError
          ) {
            console.error(
              "Trusted analytics:",
              loadError
            );

            setError(
              loadError?.message ||
              "Could not load analytics."
            );
          } finally {
            setLoading(
              false
            );
          }
        },
        [
          period,
        ]
      );

    useEffect(() => {
      load(
        period
      );
    }, [
      period,
    ]);

    const changePeriod =
      (
        next
      ) => {
        setPeriod(
          next
        );
      };

    const overview =
      data?.overview ||
      {};

    const summary =
      data?.summary ||
      {};

    const contentByType =
      data?.contentByType ||
      {};

    return (
      <div className="b6-analytics-wrap">
        <section className="b6-analytics-trust">
          <header>
            <div>
              <span className="b6-kicker">
                BACKEND ANALYTICS
              </span>

              <h2>
                Recorded performance
              </h2>

              <p>
                These cards use only
                measurable backend
                values. Mock audience
                locations, breakdowns and
                random trend data are
                deliberately excluded.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                load(
                  period
                )
              }
              disabled={
                loading
              }
            >
              <FaSyncAlt />

              {loading
                ? "Loading..."
                : "Refresh"}
            </button>
          </header>

          <div className="b6-periods">
            {PERIODS.map(
              (
                item
              ) => (
                <button
                  type="button"
                  key={
                    item.id
                  }
                  className={
                    period ===
                    item.id
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    changePeriod(
                      item.id
                    )
                  }
                >
                  {
                    item.label
                  }
                </button>
              )
            )}
          </div>

          {error && (
            <div className="b6-alert error">
              {error}
            </div>
          )}

          <div className="b6-metric-grid">
            <article>
              <FaPlay />

              <div>
                <strong>
                  {number(
                    summary.totalPlays ??
                    overview.totalPlays
                  )}
                </strong>

                <span>
                  Total plays
                </span>
              </div>
            </article>

            <article>
              <FaUsers />

              <div>
                <strong>
                  {number(
                    overview.totalFollowers
                  )}
                </strong>

                <span>
                  Followers
                </span>
              </div>
            </article>

            <article>
              <FaHeadphones />

              <div>
                <strong>
                  {number(
                    overview.avgListeners
                  )}
                </strong>

                <span>
                  Avg recorded
                  listeners
                </span>
              </div>
            </article>

            <article>
              <FaChartLine />

              <div>
                <strong>
                  {number(
                    overview.peakListeners
                  )}
                </strong>

                <span>
                  Peak listeners
                </span>
              </div>
            </article>

            <article>
              <FaBroadcastTower />

              <div>
                <strong>
                  {number(
                    contentByType
                      ?.broadcasts
                      ?.count
                  )}
                </strong>

                <span>
                  Broadcasts
                </span>
              </div>
            </article>

            <article>
              <FaChartLine />

              <div>
                <strong>
                  {number(
                    summary.totalTracks ??
                    overview.totalTracks
                  )}
                </strong>

                <span>
                  Published audio
                </span>
              </div>
            </article>
          </div>

          <div className="b6-data-boundary">
            Audience geography,
            audience breakdowns,
            listening-pattern charts
            and change percentages are
            not shown because the
            current backend controller
            still contains mock values
            for those fields.
          </div>
        </section>

        <LegacyCreatorAnalyticsWorkspace
          {...props}
          analytics={
            data
              ?.legacyAnalytics ||
            props.analytics ||
            null
          }
          period={
            period
          }
          onPeriodChange={
            changePeriod
          }
          loading={
            loading
          }
        />
      </div>
    );
  };

export default CreatorAnalyticsConnectedWorkspace;
