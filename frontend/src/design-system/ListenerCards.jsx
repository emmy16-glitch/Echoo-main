import { FaCheck } from 'react-icons/fa';
import { FiArrowLeft, FiArrowRight, FiCheck, FiFileText, FiHeadphones, FiPlay } from 'react-icons/fi';

import './listener-cards.css';

const formatCompactCount = (count) => {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  if (value < 1000) return String(value);
  const compact = value / 1000;
  return `${compact % 1 === 0 ? compact : compact.toFixed(1)}K`;
};

const EchooRailHeader = ({
  icon,
  title,
  subtitle,
  onViewAll,
  onPrevious,
  onNext,
  viewAllLabel = 'View all',
}) => (
  <div className="echoo-ds-rail-header">
    <div className="echoo-ds-rail-header__titles">
      <h3>
        {icon && <span className="echoo-ds-rail-header__icon" aria-hidden="true">{icon}</span>}
        {title}
      </h3>
      {subtitle && <span className="echoo-ds-rail-header__subtitle">{subtitle}</span>}
    </div>
    <div className="echoo-ds-rail-header__actions">
      {onViewAll && (
        <button type="button" className="echoo-ds-rail-header__view-all" onClick={onViewAll}>
          {viewAllLabel} <FiArrowRight aria-hidden="true" />
        </button>
      )}
      {(onPrevious || onNext) && (
        <div className="echoo-ds-rail-header__pagination">
          <button type="button" onClick={onPrevious} disabled={!onPrevious} aria-label={`Scroll ${title} backward`}><FiArrowLeft /></button>
          <button type="button" onClick={onNext} disabled={!onNext} aria-label={`Scroll ${title} forward`}><FiArrowRight /></button>
        </div>
      )}
    </div>
  </div>
);

const EchooLiveCard = ({
  title,
  category,
  creator,
  verified = false,
  listenerCount = 0,
  artwork,
  background,
  transcriptAvailable = false,
  onOpen,
}) => (
  <button
    type="button"
    className="echoo-ds-live-card"
    style={artwork ? undefined : { background }}
    onClick={onOpen}
    aria-label={`Join ${title || 'live show'}`}
  >
    {artwork && (
      <>
        <img className="echoo-ds-live-card__image" src={artwork} alt="" loading="lazy" />
        <span className="echoo-ds-live-card__wash" style={{ background }} aria-hidden="true" />
      </>
    )}
    <span className="echoo-ds-live-card__badge"><span aria-hidden="true" /> LIVE</span>
    <span className="echoo-ds-live-card__body">
      <strong>{title || 'Live on Echoo'}</strong>
      <span>{category || 'Live'}</span>
      <span className="echoo-ds-live-card__creator">
        {creator || 'Echoo'}
        {verified && <span className="echoo-ds-live-card__verified" aria-label="Verified"><FaCheck /></span>}
      </span>
      <span className="echoo-ds-live-card__footer">
        <span>{formatCompactCount(listenerCount)} listening</span>
        {transcriptAvailable && <span className="echoo-ds-live-card__transcript"><FiFileText aria-hidden="true" /> Transcript</span>}
      </span>
    </span>
    <span className="echoo-ds-live-card__pattern" aria-hidden="true" />
  </button>
);

const EchooProgressCard = ({
  title,
  subtitle,
  artwork,
  progressPercent = 0,
  remainingLabel,
  live = false,
  onOpen,
}) => (
  <button type="button" className="echoo-ds-progress-card" onClick={onOpen} aria-label={`${live ? 'Join' : 'Resume'} ${title}`}>
    <span className="echoo-ds-progress-card__art">
      {artwork ? <img src={artwork} alt="" loading="lazy" /> : <FiHeadphones aria-hidden="true" />}
    </span>
    <span className="echoo-ds-progress-card__body">
      <strong>{title}</strong>
      <span>{subtitle}</span>
      <span className="echoo-ds-progress-card__progress">
        <span className="echoo-ds-progress-card__track"><span style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} /></span>
        <span>{remainingLabel}</span>
      </span>
    </span>
    <span className="echoo-ds-progress-card__play" aria-hidden="true"><FiPlay /></span>
  </button>
);

const EchooCreatorCard = ({
  name,
  handle,
  avatar,
  avatarColor = 'var(--echoo-ds-brand)',
  verified = false,
  followerCount = 0,
  following = false,
  busy = false,
  onOpen,
  onToggleFollow,
}) => (
  <div className="echoo-ds-creator-card">
    <button type="button" className="echoo-ds-creator-card__avatar" onClick={onOpen} aria-label={`Open ${name}`}>
      {avatar ? <img src={avatar} alt="" loading="lazy" /> : <span style={{ background: avatarColor }}>{name?.charAt(0).toUpperCase() || 'E'}</span>}
      {verified && <span className="echoo-ds-creator-card__verified"><FiCheck aria-hidden="true" /></span>}
    </button>
    <div className="echoo-ds-creator-card__info">
      <strong title={name}>{name} {verified && <span className="echoo-ds-creator-card__inline-verified"><FiCheck aria-hidden="true" /></span>}</strong>
      <span>{handle}</span>
      <span>{formatCompactCount(followerCount)} followers</span>
    </div>
    <button
      type="button"
      className={`echoo-ds-creator-card__follow${following ? ' is-following' : ''}`}
      disabled={busy}
      onClick={onToggleFollow}
      aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}
    >
      {busy ? '...' : following ? 'Following' : 'Follow'}
    </button>
  </div>
);

export { EchooCreatorCard, EchooLiveCard, EchooProgressCard, EchooRailHeader };
