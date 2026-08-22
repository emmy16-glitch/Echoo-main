# Echoo Design System

Echoo's shared visual contract is loaded once from `src/main.jsx` through
`design-system.css`. Product pages should consume the tokens and primitives
instead of defining a new palette, font stack, spacing scale, or shell.

## Public API

Use `src/design-system/index.js` as the public import surface. It exposes both
visual primitives and the authenticated product shell:

```jsx
import {
  AppShell,
  Sidebar,
  TopBar,
  PersistentAudioPlayer,
  SearchBar,
  ProfileMenu,
  EchooCard,
  EchooLiveCard,
  EchooProgressCard,
  EchooCreatorCard,
  EchooRailHeader,
} from '../../design-system';
```

`src/Components/Shared` remains the compatibility and implementation layer for
existing routes. New Listener code should import from the design-system barrel
so component names and ownership stay stable if internals move later.

## Composition

- Use `EchooAppShell` for authenticated Creator and Listener routes.
- Supply route-specific navigation, search, top actions, and a persistent slot.
- Keep page content inside the shell's main view. The shared player belongs in
  `persistentSlot` so it survives nested route changes.
- Compose dense home and discovery rows with `EchooRailHeader`, shared Listener
  cards, and an overflow rail. Preserve visible arrow controls and touch scroll.

## Tokens

`tokens.css` is the canonical alias layer for canvas, surface, ink, muted text,
brand, live, transcript, border, radius, shadow, and typography values. Prefer
`--echoo-ds-*` variables in new components. The aliases intentionally resolve to
the broader theme so future theme changes remain compatible.

## Primitives

Import the typed visual primitives from `src/design-system/index.js`:

```jsx
import {
  EchooAvatar,
  EchooBadge,
  EchooButton,
  EchooCard,
  EchooProgressBar,
  EchooSearchInput,
  EchooSectionHeader,
} from '../../design-system';
```

The shell implementation remains in `src/Components/Shared`, but its canonical
names are `AppShell`, `Sidebar`, `TopBar`, and `PersistentAudioPlayer`. The
player is controlled: the Listener layout owns playback state and passes it to
the player through props, which keeps the UI reusable and the audio instance
persistent while nested Listener routes change.

Listener loading and dialog surfaces continue to use `ListenerSkeleton`,
`ListenerModal`, and `ListenerToast` until those APIs are migrated into the
central barrel.

## States

Buttons and icon buttons must provide hover, focus-visible, active, disabled,
and loading states. Data sections own independent loading, empty, error, and
partial-failure treatment. Live and transcript status always use their semantic
red and green token families.

## Layout Rules

Use the 4px spacing scale and keep cards at 8-16px radii. Desktop Listener pages
use the shared sidebar, sticky header, flexible main column, optional discovery
rail, and persistent player. At tablet sizes the discovery rail moves below the
main content. Mobile uses touch-scrollable rails and the existing bottom
navigation while retaining the compact player.

## Ownership Rules

- `src/theme/*` owns raw typography, color, spacing, radius, shadow, breakpoint,
  and shell dimension tokens.
- `src/design-system/tokens.css` owns semantic `--echoo-ds-*` aliases used by
  shared components.
- `src/design-system/*.css` owns reusable component styling.
- Route CSS owns only page composition and genuinely unique page artwork.
- New pages must not add a second palette, type scale, elevation scale, or shell.
