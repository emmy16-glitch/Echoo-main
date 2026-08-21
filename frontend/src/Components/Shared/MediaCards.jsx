import Card from './Card';
import Badge from './Badge';
import { CardImage, Thumbnail } from './ImagePrimitives';

const AudioCard = ({
  title,
  creator,
  artwork,
  meta,
  badge,
  onPlay,
  children,
  className = '',
  ...props
}) => (
  <Card variant="audio" interactive={Boolean(onPlay)} className={`echoo-ui-audio-card ${className}`.trim()} {...props}>
    <div className="echoo-ui-audio-card__media">
      {artwork ? <Thumbnail src={artwork} alt="" /> : <div className="echoo-ui-media-placeholder" aria-hidden="true" />}
      {onPlay && <button type="button" className="echoo-ui-media-play" onClick={onPlay} aria-label={`Play ${title || 'audio'}`}>▶</button>}
    </div>
    <div className="echoo-ui-audio-card__body">
      <strong>{title || 'Untitled audio'}</strong>
      <span>{creator || 'Echoo'}</span>
      {meta && <small>{meta}</small>}
      {badge && <Badge tone="neutral">{badge}</Badge>}
      {children}
    </div>
  </Card>
);

const StationCard = ({
  name,
  creator,
  artwork,
  description,
  live = false,
  onOpen,
  children,
  className = '',
  ...props
}) => (
  <Card variant="station" interactive={Boolean(onOpen)} className={`echoo-ui-station-card ${className}`.trim()} {...props}>
    {artwork ? <CardImage src={artwork} alt="" /> : <div className="echoo-ui-media-placeholder echoo-ui-media-placeholder--station" aria-hidden="true" />}
    <div className="echoo-ui-station-card__body">
      <div className="echoo-ui-station-card__heading">
        <strong>{name || 'Untitled station'}</strong>
        {live && <Badge tone="live">Live now</Badge>}
      </div>
      {creator && <span>{creator}</span>}
      {description && <p>{description}</p>}
      {onOpen && <button type="button" className="echoo-ui-link-button" onClick={onOpen}>Open station</button>}
      {children}
    </div>
  </Card>
);

export { AudioCard, StationCard };
