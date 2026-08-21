import './progress.css';

/**
 * EchooProgressBar — thin determinate progress bar.
 * value: 0–100
 */
const EchooProgressBar = ({
  value = 0,
  max = 100,
  tone = 'brand',
  className = '',
  label,
  ...props
}) => {
  const clamped = Math.max(0, Math.min(100, (Number(value) / Math.max(1, Number(max))) * 100));
  return (
    <span
      className={`echoo-ds-progress echoo-ds-progress--${tone} ${className}`.trim()}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      {...props}
    >
      <span className="echoo-ds-progress__fill" style={{ width: `${clamped}%` }} />
    </span>
  );
};

export default EchooProgressBar;
