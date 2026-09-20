import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Global ⌘K command palette (beUI pattern): fuzzy nav across the app.
const COMMANDS = [
  { label: 'Go to Broadcast', hint: 'Creator', path: '/creator-studio', keywords: 'broadcast live studio go' },
  { label: 'Go to Channel', hint: 'Creator', path: '/creator-studio/channels', keywords: 'channel station creator' },
  { label: 'Go to Recordings', hint: 'Creator', path: '/creator-studio/recordings', keywords: 'recordings audio tracks' },
  { label: 'Go to Collections', hint: 'Creator', path: '/creator-studio/collections', keywords: 'collections playlists' },
  { label: 'Go to Schedule Events', hint: 'Creator', path: '/creator-studio/schedule-events', keywords: 'schedule events plan' },
  { label: 'Go to Analytics', hint: 'Creator', path: '/creator-studio/analytics', keywords: 'analytics stats insights' },
  { label: 'Go to Audience', hint: 'Creator', path: '/creator-studio/audience', keywords: 'audience followers fans' },
  { label: 'Go to Settings', hint: 'Creator', path: '/creator-studio/settings', keywords: 'settings preferences' },
  { label: 'Listen: Home', hint: 'Listener', path: '/listen', keywords: 'listen home feed' },
  { label: 'Listen: Search', hint: 'Listener', path: '/listen/search', keywords: 'search find discover' },
  { label: 'Listen: Live', hint: 'Listener', path: '/listen/live', keywords: 'live now playing' },
  { label: 'Listen: Library', hint: 'Listener', path: '/listen/library', keywords: 'library saved collection' },
  { label: 'Listen: Channels', hint: 'Listener', path: '/listen/channels', keywords: 'channels stations browse' },
];

const CommandPalette = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery('');
        setActive(0);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open ]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return COMMANDS;
    return COMMANDS.filter((command) =>
      `${command.label} ${command.hint} ${command.keywords}`.toLowerCase().includes(needle)
    ).slice(0, 9);
  }, [query]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const run = (path) => {
    setOpen(false);
    if (path) navigate(path);
  };

  return (
    <div className="eb-palette-overlay eb-backdrop-in" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="eb-palette eb-modal-in" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a command or search…"
          aria-label="Command search"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (event.key === 'Enter') run(results[active]?.path);
          }}
        />
        <div className="eb-palette-list" role="listbox">
          {results.length === 0 && <div className="eb-hint" style={{ padding: '12px' }}>No matching destinations.</div>}
          {results.map((command, index) => (
            <button key={command.path} type="button" role="option" aria-selected={index === active}
              className={index === active ? 'active' : ''}
              onMouseEnter={() => setActive(index)}
              onClick={() => run(command.path)}>
              <span>{command.label}</span>
              <kbd>{command.hint}</kbd>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
