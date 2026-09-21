// Duration picker — Rare duration-picker pattern: stepper over planned
// lengths with a live end-time preview.
const PRESETS = [15, 30, 45, 60, 90, 120, 180];

const formatMinutes = (minutes) => {
  const value = Math.max(0, Number(minutes) || 0);
  if (value >= 60 && value % 60 === 0) return `${value / 60} hr`;
  if (value >= 60) return `${Math.floor(value / 60)} hr ${value % 60} min`;
  return `${value} min`;
};

const DurationPicker = ({ value = 60, onChange, disabled = false, startLabel = '' }) => {
  const step = (direction) => {
    const index = PRESETS.indexOf(Number(value));
    const next = index < 0
      ? PRESETS.reduce((best, preset) => (Math.abs(preset - value) < Math.abs(best - value) ? preset : best), PRESETS[3])
      : PRESETS[Math.max(0, Math.min(PRESETS.length - 1, index + direction))];
    onChange?.(next);
  };

  return (
    <div className="eb-duration" role="group" aria-label="Planned length">
      <button type="button" onClick={() => step(-1)} disabled={disabled} aria-label="Shorter">−</button>
      <span aria-live="polite">{formatMinutes(value)}{startLabel ? ` · ends ${startLabel}` : ''}</span>
      <button type="button" onClick={() => step(1)} disabled={disabled} aria-label="Longer">+</button>
    </div>
  );
};

export default DurationPicker;
