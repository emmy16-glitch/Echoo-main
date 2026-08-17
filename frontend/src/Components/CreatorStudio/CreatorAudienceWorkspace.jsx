import React, {
  useMemo,
} from "react";

import {
  FaGlobeAfrica,
  FaMapMarkerAlt,
  FaSignal,
  FaUsers,
} from "react-icons/fa";

import EchoSignal from "../EchooSystem/EchoSignal";

import "./CreatorPhase10.css";

const hasValue = (
  value
) =>
  value !== null &&
  value !== undefined &&
  value !== "";

const formatNumber = (
  value
) => {
  if (
    !hasValue(
      value
    )
  ) {
    return "—";
  }

  const number =
    Number(value);

  if (
    Number.isNaN(
      number
    )
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US"
  ).format(
    number
  );
};

const getItemLabel = (
  item,
  keys
) => {
  for (
    const key of keys
  ) {
    if (
      hasValue(
        item?.[key]
      )
    ) {
      return String(
        item[key]
      );
    }
  }

  return "Unknown";
};

const getItemValue = (
  item
) => {
  const possibilities = [
    item?.count,
    item?.value,
    item?.listeners,
    item?.total,
  ];

  for (
    const value of
    possibilities
  ) {
    if (
      hasValue(
        value
      )
    ) {
      const number =
        Number(value);

      return Number.isNaN(
        number
      )
        ? 0
        : number;
    }
  }

  return 0;
};

const AudienceBreakdown = ({
  title,
  description,
  icon,
  items,
  labelKeys,
  emptyTitle,
  emptyText,
}) => {
  const values =
    items.map(
      getItemValue
    );

  const maximum =
    Math.max(
      ...values,
      0
    );

  return (
    <section className="creator10-breakdown">
      <header>
        <span>
          {icon}
        </span>

        <div>
          <h3>
            {title}
          </h3>

          <p>
            {description}
          </p>
        </div>
      </header>

      {items.length >
      0 ? (
        <div className="creator10-ranked-list">
          {items.map(
            (
              item,
              index
            ) => {
              const value =
                getItemValue(
                  item
                );

              const width =
                maximum >
                0
                  ? Math.max(
                      5,
                      (
                        value /
                        maximum
                      ) *
                        100
                    )
                  : 0;

              return (
                <article
                  key={
                    getItemLabel(
                      item,
                      labelKeys
                    ) +
                    index
                  }
                >
                  <div className="creator10-ranked-heading">
                    <span>
                      <i>
                        {index +
                          1}
                      </i>

                      {getItemLabel(
                        item,
                        labelKeys
                      )}
                    </span>

                    <strong>
                      {formatNumber(
                        value
                      )}
                    </strong>
                  </div>

                  <div className="creator10-data-track">
                    <span
                      className={
                        index ===
                        0
                          ? "top"
                          : ""
                      }
                      style={{
                        width:
                          `${width}%`,
                      }}
                    />
                  </div>
                </article>
              );
            }
          )}
        </div>
      ) : (
        <div className="creator10-data-empty">
          <EchoSignal
            size="md"
            state="idle"
            activeNodes={0}
          />

          <div>
            <strong>
              {
                emptyTitle
              }
            </strong>

            <p>
              {
                emptyText
              }
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

const CreatorAudienceWorkspace = ({
  audience = null,
  loading = false,
}) => {
  const topListeners =
    audience
      ?.topListeners ||
    {};

  const demographics =
    audience
      ?.demographics ||
    {};

  const countries =
    Array.isArray(
      demographics
        ?.topCountries
    )
      ? demographics
          .topCountries
      : [];

  const cities =
    Array.isArray(
      demographics
        ?.topCities
    )
      ? demographics
          .topCities
      : [];

  const ageRanges =
    Array.isArray(
      demographics
        ?.ageRanges
    )
      ? demographics
          .ageRanges
      : [];

  const metrics =
    useMemo(
      () => [
        {
          label:
            "Followers",

          value:
            audience
              ?.totalFollowers,

          helper:
            "People currently following your creator profile.",

          icon:
            <FaUsers />,
        },

        {
          label:
            "Top listeners",

          value:
            topListeners
              ?.total,

          helper:
            "Listener-ranking total returned by the Audience API.",

          icon:
            <FaSignal />,
        },

        {
          label:
            "Average",

          value:
            topListeners
              ?.average,

          helper:
            "Average listener value returned by the backend.",

          icon:
            <FaUsers />,
        },

        {
          label:
            "Peak",

          value:
            topListeners
              ?.peak,

          helper:
            "Peak listener value currently available.",

          icon:
            <FaSignal />,
        },
      ],
      [
        audience,
        topListeners,
      ]
    );

  if (loading) {
    return (
      <section className="creator10-page">
        <div className="creator10-header-loading" />

        <div className="creator10-metric-loading">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  return (
    <section className="creator10-page">
      <header className="creator10-page-header">
        <div>
          <span className="creator10-kicker">
            YOUR AUDIENCE
          </span>

          <h1>
            See who is
            showing up.
          </h1>

          <p>
            Understand the
            audience information
            Echoo can actually see
            today, without
            inventing demographic
            or listener data.
          </p>
        </div>

        <EchoSignal
          size="lg"
          state={
            Number(
              audience
                ?.totalFollowers
            ) > 0
              ? "listening"
              : "idle"
          }
          activeNodes={
            Number(
              audience
                ?.totalFollowers
            ) > 0
              ? 1
              : 0
          }
        />
      </header>

      <section className="creator10-metric-strip">
        {metrics.map(
          (
            metric
          ) => (
            <article
              key={
                metric.label
              }
            >
              <div className="creator10-metric-label">
                <span>
                  {
                    metric.icon
                  }
                </span>

                <small>
                  {
                    metric.label
                  }
                </small>
              </div>

              <strong>
                {formatNumber(
                  metric.value
                )}
              </strong>

              <p>
                {
                  metric.helper
                }
              </p>
            </article>
          )
        )}
      </section>

      <section className="creator10-audience-intro">
        <span>
          AUDIENCE PRESENCE
        </span>

        <h2>
          Geography should tell
          you where people are,
          not decorate the
          dashboard.
        </h2>

        <p>
          Echoo only shows
          geography when the
          backend has real
          listener data to
          support it.
        </p>
      </section>

      <div className="creator10-breakdown-grid">
        <AudienceBreakdown
          title="Top countries"
          description="Countries represented in your audience data."
          icon={
            <FaGlobeAfrica />
          }
          items={
            countries
          }
          labelKeys={[
            "country",
            "name",
            "label",
          ]}
          emptyTitle="No country data yet"
          emptyText="The backend is not returning geographic country analytics yet."
        />

        <AudienceBreakdown
          title="Top cities"
          description="Cities currently represented in your audience."
          icon={
            <FaMapMarkerAlt />
          }
          items={
            cities
          }
          labelKeys={[
            "city",
            "name",
            "label",
          ]}
          emptyTitle="No city data yet"
          emptyText="City analytics will appear here when Echoo starts receiving them."
        />
      </div>

      <section className="creator10-age-section">
        <div className="creator10-section-heading">
          <div>
            <h2>
              Age ranges
            </h2>

            <p>
              Only displayed when
              demographic age data
              is returned by the
              Audience API.
            </p>
          </div>
        </div>

        {ageRanges.length >
        0 ? (
          <div className="creator10-age-list">
            {ageRanges.map(
              (
                item,
                index
              ) => (
                <article
                  key={
                    item.range ||
                    item.age ||
                    item.label ||
                    index
                  }
                >
                  <span>
                    {item.range ||
                      item.age ||
                      item.label ||
                      "Unknown"}
                  </span>

                  <strong>
                    {formatNumber(
                      getItemValue(
                        item
                      )
                    )}
                  </strong>
                </article>
              )
            )}
          </div>
        ) : (
          <div className="creator10-data-empty borderless">
            <EchoSignal
              size="md"
              state="idle"
              activeNodes={0}
            />

            <div>
              <strong>
                No age-range
                data yet
              </strong>

              <p>
                Echoo will not
                generate demographic
                placeholders when
                this information is
                unavailable.
              </p>
            </div>
          </div>
        )}
      </section>
    </section>
  );
};

export default CreatorAudienceWorkspace;
