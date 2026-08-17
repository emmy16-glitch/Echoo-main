import { useMemo } from 'react';
import {
  FaGlobeAfrica,
  FaMapMarkerAlt,
  FaSignal,
  FaUsers,
} from 'react-icons/fa';

import EchoSignal from '../EchooSystem/EchoSignal';
import './CreatorPhase10.css';

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US').format(Number(value) || 0);

const CreatorAudienceWorkspace = ({ audience = null, loading = false }) => {
  const topListeners = audience?.topListeners || {};
  const followers = Array.isArray(audience?.followers) ? audience.followers : [];
  const demographics = audience?.demographics || {};
  const countries = Array.isArray(demographics.topCountries) ? demographics.topCountries : [];
  const cities = Array.isArray(demographics.topCities) ? demographics.topCities : [];
  const ageRanges = Array.isArray(demographics.ageRanges) ? demographics.ageRanges : [];
  const hasDemographics = countries.length > 0 || cities.length > 0 || ageRanges.length > 0;

  const metrics = useMemo(
    () => [
      {
        label: 'Followers',
        value: audience?.totalFollowers,
        icon: <FaUsers />,
      },
      {
        label: 'Listening now',
        value: topListeners.total,
        icon: <FaSignal />,
      },
      {
        label: 'Average listeners',
        value: topListeners.average,
        icon: <FaUsers />,
      },
      {
        label: 'Peak listeners',
        value: topListeners.peak,
        icon: <FaSignal />,
      },
    ],
    [audience?.totalFollowers, topListeners.average, topListeners.peak, topListeners.total]
  );

  if (loading) {
    return (
      <section className="creator10-page">
        <div className="creator10-header-loading" />
        <div className="creator10-metric-loading"><span /><span /><span /><span /></div>
      </section>
    );
  }

  return (
    <section className="creator10-page">
      <header className="creator10-page-header">
        <div>
          <span className="creator10-kicker">AUDIENCE</span>
          <h1>See who is listening.</h1>
          <p>Followers and listening activity from your creator account.</p>
        </div>

        <EchoSignal
          size="lg"
          state={Number(topListeners.total) > 0 ? 'listening' : 'idle'}
          activeNodes={Number(topListeners.total) > 0 ? 2 : 0}
        />
      </header>

      <section className="creator10-metric-strip">
        {metrics.map((metric) => (
          <article key={metric.label}>
            <div className="creator10-metric-label">
              <span>{metric.icon}</span>
              <small>{metric.label}</small>
            </div>
            <strong>{formatNumber(metric.value)}</strong>
          </article>
        ))}
      </section>

      <section className="creator10-age-section">
        <div className="creator10-section-heading">
          <div>
            <h2>Followers</h2>
            <p>People currently following your creator profile.</p>
          </div>
        </div>

        {followers.length > 0 ? (
          <div className="creator10-age-list">
            {followers.map((follower, index) => (
              <article key={follower.id || follower._id || index}>
                <span>{follower.displayName || follower.username || 'Echoo listener'}</span>
                <strong>{follower.userType || 'listener'}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="creator10-data-empty borderless">
            <EchoSignal size="md" state="idle" activeNodes={0} />
            <div>
              <strong>No followers yet</strong>
              <p>People who follow you will appear here.</p>
            </div>
          </div>
        )}
      </section>

      {hasDemographics ? (
        <section className="creator10-age-section">
          <div className="creator10-section-heading">
            <div>
              <h2>Audience insights</h2>
              <p>Location and age information available for your audience.</p>
            </div>
          </div>

          <div className="creator10-breakdown-grid">
            {countries.length > 0 && (
              <section className="creator10-breakdown">
                <header><span><FaGlobeAfrica /></span><div><h3>Top countries</h3></div></header>
                <div className="creator10-ranked-list">
                  {countries.map((item, index) => (
                    <article key={item.country || item.name || index}>
                      <div className="creator10-ranked-heading">
                        <span>{item.country || item.name || 'Unknown'}</span>
                        <strong>{formatNumber(item.count || item.value)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {cities.length > 0 && (
              <section className="creator10-breakdown">
                <header><span><FaMapMarkerAlt /></span><div><h3>Top cities</h3></div></header>
                <div className="creator10-ranked-list">
                  {cities.map((item, index) => (
                    <article key={item.city || item.name || index}>
                      <div className="creator10-ranked-heading">
                        <span>{item.city || item.name || 'Unknown'}</span>
                        <strong>{formatNumber(item.count || item.value)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>

          {ageRanges.length > 0 && (
            <div className="creator10-age-list">
              {ageRanges.map((item, index) => (
                <article key={item.range || item.label || index}>
                  <span>{item.range || item.label || 'Unknown'}</span>
                  <strong>{formatNumber(item.count || item.value)}</strong>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="creator10-age-section">
          <div className="creator10-data-empty borderless">
            <EchoSignal size="md" state="idle" activeNodes={0} />
            <div>
              <strong>More audience insights will appear here</strong>
              <p>Echoo will add more detail as your listening activity grows.</p>
            </div>
          </div>
        </section>
      )}
    </section>
  );
};

export default CreatorAudienceWorkspace;
