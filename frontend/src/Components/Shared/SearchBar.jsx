import { forwardRef } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';

import { Thumbnail } from './ImagePrimitives';
import './SharedPrimitives.css';

const SearchBar = forwardRef(({
  value = '',
  inputRef,
  onChange,
  onFocus,
  placeholder = 'Search Echoo...',
  open = false,
  suggestions = [],
  results = [],
  loading = false,
  error = '',
  onSuggestion,
  onResult,
  onClear,
  className = '',
  ...props
}, ref) => (
  <div ref={ref} className={`echoo-search-bar-wrap ${className}`.trim()}>
    <div className={`echoo-search-bar${open ? ' is-open' : ''}`}>
      <FaSearch className="echoo-search-bar__icon" aria-hidden="true" />
      <input ref={inputRef} value={value} onChange={onChange} onFocus={onFocus} placeholder={placeholder} {...props} />
      {value ? (
        <button type="button" className="echoo-search-bar__clear" onClick={onClear} aria-label="Clear search">
          <FaTimes />
        </button>
      ) : (
        <span className="echoo-search-bar__shortcut" aria-hidden="true">/</span>
      )}
    </div>
    {open && (suggestions.length > 0 || loading || error || results.length > 0) && (
      <div className="echoo-search-bar__panel">
        {!value.trim() && suggestions.length > 0 ? (
          <div className="echoo-search-bar__section">
            <span className="echoo-search-bar__label">Try searching</span>
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => onSuggestion?.(suggestion)}>
                <FaSearch /> <span>{suggestion}</span>
              </button>
            ))}
          </div>
        ) : loading ? (
          <div className="echoo-search-bar__empty"><strong>Searching Echoo...</strong></div>
        ) : error ? (
          <div className="echoo-search-bar__empty"><strong>Search unavailable</strong><span>{error}</span></div>
        ) : (
          <div className="echoo-search-bar__results">
            {results.map((item) => (
              <button key={item.id || item._id || item.title} type="button" onClick={() => onResult?.(item)}>
                <span className="echoo-search-bar__result-art">
                  {item.coverArt ? <Thumbnail src={item.coverArt} alt="" /> : <FaSearch />}
                </span>
                <span className="echoo-search-bar__result-copy"><strong>{item.title}</strong><small>{item.subtitle || item.artistName || 'Echoo'}</small></span>
                <span className="echoo-search-bar__result-type">{item.genre || 'Audio'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
));

SearchBar.displayName = 'SearchBar';

export default SearchBar;
