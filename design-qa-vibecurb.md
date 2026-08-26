# ECHOO VibeCurb design audit and progress

Last audited: 2026-08-26. Governing method: `.agents/skills/visual-redesign/SKILL.md`.

## Scope and safety boundary

### SACRED — functional behavior

- React state/effects/callbacks/memos, contexts, refs, conditional rendering, route guards and navigation.
- API, realtime/WebSocket, LiveKit, Web Audio, Echoo mixer, microphone processing, source connection, gain/mute,
  monitoring, master output, broadcast and player state.
- Authentication, form validation/submission, error handling, analytics/data transformations.
- Existing element IDs, ARIA attributes, `data-*` hooks, and selectors that can be used by JavaScript or tests.

### REDESIGNABLE — visual layer

- Tokens, typography, spacing, color, borders, shadows, radii, layout styles, safe class names, responsive rules,
  control states, and restrained motion.
- Reusable CSS primitives and presentational wrappers only when they do not alter component ordering, refs,
  conditions, props, or event behavior.

## Current design architecture

### Applications and entry points

- `frontend/` is the active React 19/Vite web application. `frontend/src/main.jsx` loads the global cascade;
  `frontend/src/App.jsx` owns auth/onboarding flow, role protection, and route composition.
- `backend/` supplies API/realtime/audio contracts. It is out of scope for visual implementation.
- `desktop/` is an Electron shell around the working frontend/audio paths. It is a functional-risk consumer of UI
  controls, not a visual source to rewrite.
- `mobile/` is a separate Expo app. Its scoped `mobile/AGENTS.md` requires Expo v54 documentation before code changes;
  the web redesign must not silently change it. Mobile-web QA is still in scope.

### Rendered web route trace

| Route | Page/shell | Active UI/CSS ownership | Risk |
| --- | --- | --- | --- |
| `/` | `OnboardingFlow` in `App.jsx` | Register, ProfileSetup, ChooseRole, CreatorSetup, OnboardingFrame and auth/onboarding CSS | High |
| `/creator-studio` | `CreatorStudio.jsx` | Creator sidebar/topbar/workspace router plus component-local Creator CSS and root Creator correction layers | High |
| Creator Broadcast pre-live | `CreatorLiveConnectedWorkspace.jsx` → `CreatorBroadcastAudioSurface.jsx` | `CreatorBroadcastStudio*`, `CreatorLiveBroadcastConsole`, audio surface styles | **Critical** |
| Creator Broadcast live | `CreatorLiveConnectedWorkspace.jsx` → `CreatorAudioMixer.jsx` | `CreatorAudioMixer.css`, broadcast CSS, late Creator correction layers | **Critical** |
| `/listen/*` | `ListenerLayout.jsx` → nested route outlet | listener shell/player/search/account menu CSS plus root listener layers | **Critical** |
| `/listen` | `ListenerHome.jsx` | home hero, live/station/replay cards, root listener layers | High |
| Listener live/room | `ListenerLiveConnected`, `ListenerRealLiveRoom`, `LiveKitListenerPlayer` | live/room/player CSS | **Critical** |
| Library, following, playlists, history, downloads, stations, settings, notifications, profile/search | lazy listener route components | page-local CSS and shared listener reference layers | Medium–High |

### Cascade finding

- `main.jsx` currently imports **44** CSS files directly, in addition to CSS loaded by lazy route components.
- The source contains **178 CSS files**, **150 component-level CSS imports**, and **7,710 `!important` declarations**.
- `EchooTheme.css`, `theme/*`, `design-system/tokens.css`, `SharedPrimitives.css`, and several late “final”,
  “integrity”, “hardening”, and Playwright-fix sheets each define overlapping shells/tokens.
- `ListenerLayout.jsx` imports `echoo-identity-reset.css` before its local layout styles. That sheet contains broad,
  high-specificity listener shell geometry, including fixed dimensions and `!important` overrides.
- Creator pages similarly stack `CreatorStudio*.css`, `CreatorBroadcastStudio*.css`, root Creator audit/final/harmony
  sheets, and component-local CSS. Import order, not a single design system, decides many visible styles.

## Existing visual strengths worth preserving

- ECHOO has a recognizable blue identity and a calm pale-blue/ink application palette.
- Listener Home has an audio-first “now playing” scene, meaningful live state, data-backed artwork fallbacks, and
  a persistent player instead of generic dashboard furniture.
- Creator Studio already exposes a coherent workflow model: choose a station, configure audio, connect sources,
  monitor, then enter a live mixer. The existing pre-live/live transition intentionally shares mixer state.
- Auth has reference-driven QA evidence and retains branded audio/microphone storytelling.
- Semantic labels, focus support, route guards, loading/error states, and several purpose-built Playwright suites
  already exist. These must be retained and expanded, never redesigned out.

## Audit findings

### Typography problems

1. Three token vocabularies coexist: `--echoo-color-*`, compatibility aliases such as `--echoo-text-h`, and
   `--echoo-ds-*`. `EchooTheme.css` then overwrites several aliases with different values.
2. The formal typography token sheet uses Inter/system fallback only, while existing reference/auth surfaces use
   Georgia/editorial rules and many page CSS files set literal font declarations. This fragments Creator, Listener,
   and onboarding hierarchy.
3. Heading sizes/weights/rhythm are set both by shared tokens and many page-specific rules; visual priority can vary
   between equally important section titles.
4. Caption/meta text has been repeatedly forced small in hardening layers. This needs contrast and minimum-size QA,
   especially in meters, player details, source cards, and mobile nav.

### Spacing and layout problems

1. The base spacing scale ends at `--echoo-space-16`, while pages use ad-hoc values extensively. Large section and
   responsive spacing are not expressed as a shared cadence.
2. Sidebar widths conflict: theme declares 244px, while `echoo-identity-reset.css` forces 205px with `!important`.
   This is a direct layout-drift source for listener main/player geometry.
3. Fixed shell, persistent-player and topbar rules are repeated across style layers, increasing collision risk at
   tablet/mobile widths.
4. Creator’s operational panels contain mixed density: setup stages can feel roomy while high-frequency live controls
   become cramped or visually nested. Both stages must use one control and section rhythm.

### Color and token inconsistencies

1. `colors.css` declares brand `#246bfe`, `EchooTheme.css` overwrites compatibility blue with `#1769d3`, and auth
   reference work documents `#0B63F6`. A single named accent scale is missing.
2. The theme has success/danger/live values but no standardized warning token and no single elevated surface token.
3. Some late sheets use literal neutrals, black/white and box shadows rather than semantic tokens. The result can be
   a clinical page next to a warmer editorial auth surface.
4. Several design-system fallbacks preserve another duplicate visual vocabulary rather than resolving to a canonical
   ECHOO vocabulary.

### Component inconsistencies

- Two shared component collections exist: `Components/Shared/*` and `design-system/*`. Both cover buttons, cards,
  badges, avatars, search, progress and player primitives, but they do not have one declared adoption boundary.
- Listener cards, Creator cards, onboarding cards, stations, and mixer/source cards use different radius/padding/
  shadow languages.
- Button treatment differs among generic primary buttons, page-local buttons, player icon buttons, source actions,
  and auth CTAs. State styles must be standardized without changing handlers.
- Input/select/range styling is especially inconsistent. Range controls are high-value in the mixer and must maintain
  visible focus, usable pointer/touch targets, and distinguishable active/muted/error states.

### Creator and Listener drift

- Listener is discovery/editorial/media-led; Creator is operational/dashboard-led. That distinction is appropriate,
  but they currently look assembled by separate systems because font, radius, shell width, and card depths vary.
- Pre-live Audio Setup (`CreatorBroadcastAudioSurface`) and Live Mixer (`CreatorAudioMixer`) preserve the same mixer
  state in code but use separately evolved visual treatments. This is the top design-continuity correction.
- Status indicators are presented in multiple styles across broadcast health, mixer levels, player, and live cards.
  They need shared semantic status tokens and labels.

### Responsive defects/risk areas to validate in browser

These are audit candidates, not unverified claims; they must be confirmed at the specified viewports before removal
or consolidation of any rule.

- Listener shell has fixed rail/main/player geometry declared in more than one layer. Check 1440, 1280, 1024, 820,
  768, 430, 390, 375 and 320 for player collisions and horizontal overflow.
- `echoo-identity-reset.css` forces `height: 100vh`, fixed positioning and `overflow: hidden`; dynamic mobile browser
  height, expanded player and modal states need `dvh` validation.
- Creator broadcast has a main mixer plus chat/insights aside. Validate stacked ordering, range-control touch area and
  end-broadcast dialog at tablet and narrow mobile widths.
- Auth/onboarding has separate phone-viewport, login, reference, motion and layout-audit sheets. Validate virtual
  keyboard, error states, long labels, and onboarding progress at 320/375/390 widths.
- All persistent/fixed surfaces require explicit safe-area and bottom-inset checks, including expanded player,
  account menus, search panels, file picker paths, and dialogs.

### Legacy CSS conflicts and duplication

| Area | Evidence | Design action | Safety condition |
| --- | --- | --- | --- |
| Root CSS cascade | 44 entry imports; several `final`, `integrity`, `hardening`, `run*` layers | Establish one canonical token/primitives layer loaded last; inventory each duplicate rule | Do not remove source styles until route visual and E2E checks pass |
| Listener geometry | `echoo-identity-reset.css` hard-forces 205px rail/main/player geometry | Move validated dimensions to canonical layout tokens, then remove only superseded declarations | Check all listener routes and full player |
| Creator Studio | Many `CreatorStudio*`, `CreatorBroadcastStudio*`, audit/final CSS layers | Consolidate shared shell/card/control rules by component family | Preserve mixer/live handlers, source file input and LiveKit states |
| Auth/onboarding | multiple redesign/reference/viewport/motion sheets | Keep screenshot-reference paths intact; factor only proven common controls/tokens | Run reference Playwright suites before/after |
| Shared primitives | both `Components/Shared` and `design-system` supply overlapping primitives | Declare one canonical CSS contract and compatibility aliases during migration | Avoid component API/JSX rewrites |

### Risk classification

**High/critical risk (CSS-only changes, focused testing after each change)**

- `CreatorLiveConnectedWorkspace.jsx`, `CreatorAudioMixer.jsx`, `CreatorBroadcastAudioSurface.jsx`,
  `echooMixerService.js`, `livekitPublisher.js` and all styles that determine their displayed controls.
- `ListenerLayout.jsx`, `LiveKitListenerPlayer.jsx`, `ListenerRealLiveRoom.jsx`, persistent player and related CSS.
- `App.jsx`, Register/ProfileSetup/ChooseRole/CreatorSetup and all onboarding/auth forms.
- Fixed shell/player, dialogs, file inputs, range inputs, menus, mobile navigation, accessibility repair scripts.

**Medium risk**

- Creator home/content/stations/audience/analytics/settings/notifications/collections workspaces.
- Listener home/live/stations/library/following/playlists/history/downloads/settings/notifications/search/profile pages.
- Shared cards/buttons/badges/search/header/sidebar primitives.

**Low risk**

- Token declarations, typography defaults, documented CSS-only visual utilities, empty/loading/visual illustration
  surfaces once their selectors are scoped.

## Proposed single ECHOO design system

### Canonical semantic tokens

The canonical layer will retain compatibility aliases while resolving all new shared rules through these names:

```css
:root {
  --echoo-bg: #f5f8fc;
  --echoo-surface: #ffffff;
  --echoo-surface-raised: #fbfdff;
  --echoo-text: #15243d;
  --echoo-text-secondary: #52627a;
  --echoo-text-muted: #77859a;
  --echoo-border: #dfe7f1;
  --echoo-border-strong: #c8d5e5;
  --echoo-accent: #1769d3;
  --echoo-accent-hover: #125fbe;
  --echoo-success: #187451;
  --echoo-warning: #a86612;
  --echoo-danger: #c43f48;
  --echoo-live: #dc4650;
}
```

Blue remains the only saturated product accent. Live/error/warning/success are semantic status colors, not
competing decorative accents. The light app canvas is deliberate; dark media/player surfaces remain reserved for
listening and live-audio context.

### Typography scale

- Sans UI/display: `Inter, ui-sans-serif, system-ui, sans-serif` until a bundled/licensed display family is approved.
  Do not introduce a remote font dependency as part of this redesign.
- Editorial display is limited to the already reference-approved auth/storytelling treatments, not operational controls.
- Display: `clamp(2.25rem, 3.8vw, 4rem) / .98 / 720 / -.045em`.
- H1: `clamp(1.875rem, 2.7vw, 3rem) / 1.05 / 700 / -.035em`.
- H2: `clamp(1.375rem, 1.8vw, 1.75rem) / 1.16 / 700 / -.025em`.
- H3: `1.0625rem / 1.32 / 680 / -.012em`; body `1rem / 1.55 / 400`; meta `0.8125rem / 1.42 / 560`.

### Spacing, radii, depth and controls

- 4px base spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 112px.
- Shared page padding: responsive `clamp(16px, 2.2vw, 32px)`; major section rhythm: 32/48px depending on density.
- Radius language: 8px controls/small media, 12px cards, 16px large panels/dialogs, pill only for tags/avatars/statuses.
- Depth: flat canvas + subtle border at rest; small blue-neutral shadow only for overlays, menus, dialog elevation and
  deliberate hover states. No nested-card shadow stacking.
- Control height: 44px default, 40px compact desktop-only, 48px touch-first actions. Icon controls maintain a 40px
  visible target and 44px touch target where feasible.

### Card, button and input system

- Cards use one surface, border, 12px radius and context-driven padding. Media cards may be border-light; operational
  studio cards use a clearer section header and status row instead of cards inside cards.
- Primary button: solid ECHOO blue, white text, 44px minimum height. Secondary: raised neutral surface and clear
  border. Destructive: semantic danger treatment. Disabled remains visibly disabled and non-deceptive.
- Inputs/selects/textareas use the same border/background/focus ring. Range inputs receive accessible focus and
  standardized track/thumb colors without changing range values or handlers.
- Status elements use semantic live/success/warning/danger tokens plus text/icons; color alone never conveys state.

### Motion system (deferred until Stage 11)

- Motion personality: **Surgical** for a high-frequency audio application. Entries/reveals use one custom deceleration,
  state changes use one smooth curve, and hover/press uses one snap curve.
- High-frequency player/mixer/nav controls get immediate, minimal feedback only; no animated layout, scroll-jacking,
  or decorative motion in audio controls.
- Every transition specifies only the affected properties. Respect `prefers-reduced-motion`; use opacity-only or no
  motion where appropriate.

## Controlled implementation sequence

1. Establish canonical tokens and typography compatibility aliases.
2. Unify shared shell/navigation/page/card/button/input/status primitives without altering handler logic.
3. Create one Creator Studio visual contract; align pre-live Audio Setup and Live Mixer.
4. Apply that contract to remaining Creator workspaces.
5. Consolidate Listener shell and persistent player geometry.
6. Improve Listener Home, Live and Live Room hierarchy.
7. Standardize Stations, Library, Following, Playlists, History and Downloads.
8. Standardize Settings, Notifications and profiles.
9. Align onboarding and authentication with the shared product system while preserving reference QA.
10. Perform desktop/tablet/mobile overflow and fixed-surface polish.
11. Add restrained, accessible motion only after hierarchy/layout pass.
12. Remove only validated redundant legacy CSS and add targeted visual regression coverage.

After every stage: inspect `git diff`, run lint/build/relevant tests, then update this checklist. Baseline build passed;
the package script’s eslint binary link is absent in this environment, but direct ESLint execution succeeds with three
pre-existing warnings: missing `liveState` effect dependency in `ListenerRealLiveRoom.jsx`, and two unused caught
`error` variables in `ListenerSettingsConnected.jsx`.

### Stage 1 validation evidence

- Production build passed after the canonical foundation was imported.
- Direct ESLint passed with the three pre-existing warnings above and no errors.
- Playwright's configured headless-shell binary cannot start in this host because its downloaded resource/V8 snapshot
  files are unavailable and Chromium repeatedly loses its GPU process. This is an environment failure before the app
  runs, not a test assertion failure.
- The `agent-browser` CLI is not installed in this host. As a safe fallback, full Playwright Chromium was launched
  directly with the system-compatible full browser executable and `--disable-gpu`.
- Visual/manual browser checks passed with no console errors and no horizontal overflow for:
  - Auth register at 1440×900.
  - Listener Home at 1440×900 and 390×844, using the existing mock API and listener auth fixture.
  - Creator Home and Creator Broadcast pre-live at 1440×900, using the existing mock API and creator auth fixture.
- The 390px Listener check confirms the fixed player and bottom navigation coexist and `scrollWidth === innerWidth`.
  Future mobile work must preserve that relationship while ensuring lower card content has adequate player-safe space.

## Progress

- [x] VibeCurb installed
- [x] Audit complete
- [x] Tokens complete
- [ ] Shared shell complete
- [ ] Creator Studio complete
- [ ] Creator remaining complete
- [ ] Listener shell complete
- [ ] Listener Home complete
- [ ] Listener Live complete
- [ ] Listener Live Room complete
- [ ] Stations complete
- [ ] Audio Library complete
- [ ] Following complete
- [ ] Playlists complete
- [ ] History complete
- [ ] Downloads complete
- [ ] Notifications complete
- [ ] Settings complete
- [ ] Onboarding complete
- [ ] Mobile QA complete
- [ ] Accessibility QA complete
- [ ] Legacy CSS cleanup complete
- [ ] Full build/test complete
