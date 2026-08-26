# ECHOO project instructions

## UI redesign safety contract

ECHOO is a working, audio-first product. Preserve functional behavior while
improving the visual layer.

### Sacred: do not casually change

- React state, effects, memoization, callbacks, contexts, refs, and conditional rendering.
- API requests, WebSocket/realtime behavior, LiveKit integration, Web Audio and mixer services.
- Audio routing, source connection, gain, mute, monitoring, master output, player state, and broadcast state.
- Authentication, route behavior, navigation behavior, form submission, error handling, analytics, and data transforms.
- Existing IDs, `data-*` hooks, ARIA attributes, and selectors used by JavaScript or tests.

Change sacred behavior only to fix a documented functional defect, with focused
verification showing the fix does not regress the affected flow.

### Redesignable: preferred tools for UI work

- Design tokens, CSS, safe `className` additions/changes, component styles, layout spacing, typography, color,
  borders, shadows, radii, responsive rules, visual states, and restrained animation.
- Reusable visual primitives and layout rules that preserve component structure and all props/handlers.

Do not restructure working JSX solely for visual preference. If an element may
be functional, assume it is functional and style it in place.

### Product consistency requirements

- Creator and Listener are one ECHOO product: share visual vocabulary, typography, control treatment, and navigation
  quality while respecting their different jobs.
- Audio Setup and the Live Mixer are consecutive stages of one Creator Studio and must share containers, controls,
  status language, and responsive behavior.
- Preserve and improve accessibility: semantic controls, focus-visible states, keyboard paths, labels, contrast,
  touch targets, and reduced-motion handling.

### CSS discipline

- Trace the route, component, import graph, and final cascade before changing a surface.
- Prefer consolidating a validated design system over adding competing override layers.
- Do not delete legacy CSS unless its redundancy or replacement has been proven and affected routes have been checked.
- Use named ECHOO tokens rather than arbitrary page-level visual values.

### Verification

- Inspect the diff after each logical stage.
- Run the relevant frontend lint, build, tests, and E2E coverage after each stage; fix regressions before continuing.
- Validate desktop, laptop, tablet, narrow tablet, mobile, and very narrow mobile layouts, including overflow and
  fixed-player/modal collisions.
