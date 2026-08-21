import './section-header.css';

/**
 * EchooSectionHeader — consistent page section title row.
 * Renders an optional kicker, the title, and an optional action.
 */
const EchooSectionHeader = ({
  kicker,
  title,
  action,
  className = '',
  ...props
}) => (
  <div className={`echoo-ds-section-header ${className}`.trim()} {...props}>
    <div className="echoo-ds-section-header__titles">
      {kicker && <span className="echoo-ds-section-header__kicker">{kicker}</span>}
      <h2 className="echoo-ds-section-header__title">{title}</h2>
    </div>
    {action && <div className="echoo-ds-section-header__action">{action}</div>}
  </div>
);

export default EchooSectionHeader;
