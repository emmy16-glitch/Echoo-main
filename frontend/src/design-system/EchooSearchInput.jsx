import { forwardRef } from 'react';
import './search-input.css';

/**
 * EchooSearchInput — large centered search field with shortcut hint.
 * Pure presentational input; the caller owns value/onChange/results.
 */
const EchooSearchInput = forwardRef(({
  value,
  onChange,
  onFocus,
  placeholder = 'Search shows, stations, creators or topics...',
  shortcut = '⌘K',
  className = '',
  inputClassName = '',
  ...props
}, ref) => (
  <div className={`echoo-ds-search ${className}`.trim()}>
    <svg
      className="echoo-ds-search__icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
    <input
      ref={ref}
      type="text"
      className={`echoo-ds-search__input ${inputClassName}`.trim()}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      placeholder={placeholder}
      aria-label={placeholder}
      {...props}
    />
    {shortcut && (
      <kbd className="echoo-ds-search__shortcut">{shortcut}</kbd>
    )}
  </div>
));

EchooSearchInput.displayName = 'EchooSearchInput';
export default EchooSearchInput;
