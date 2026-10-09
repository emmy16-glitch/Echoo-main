# Authentication reference fidelity review

Status: passed

## Reference and captured states

- Reference image: `C:\Users\member\Desktop\1cc7818c-a8d8-4079-a2eb-9b89c9651733.png` (1672 × 941 px).
- Product background: existing `frontend/src/Components/Assets/echoo-auth-studio-reference-v2.png`; the reference screenshot itself was not used as a background.
- Desktop implementation: Playwright captures at 1672 × 941 px, device scale factor 1: `frontend/design-qa-evidence/auth-approved/desktop-login.png` and `desktop-signup.png`.
- Mobile implementation: 390 × 844 px, device scale factor 1: `frontend/design-qa-evidence/auth-approved/mobile-login.png` and `mobile-signup.png`.
- Login capture has the identifier filled and password masked; signup is empty with Privacy Policy unchecked. These states make form styling, consent, and both return paths visible.

## Review

The approved image was used as a composition and material reference, not copied as a flat screenshot. The original Echoo studio photo remains visible behind the interface. The centered card uses a translucent navy glass surface with backdrop blur and restrained saturation. The thin cool-white outer keyline and lower-contrast input borders soften into the photograph rather than reading as stacked opaque panels. Input fills stay translucent; the form hierarchy, blue title, spacing, and solid blue primary action follow the reference while preserving Echoo's existing form behavior and logo assets.

The product photo has a different studio composition from the reference artwork, intentionally: the repository's existing studio image was retained. Signup includes the required registration fields and privacy consent, so its card is taller than Login. On desktop, both cards fit the captured viewport without document scrolling. Mobile has no horizontal overflow; vertical scrolling remains available for the longer signup form on short viewports.

## Verification

- Playwright: auth E2E suite across desktop 1440 × 900, mobile 390 × 844, and mobile 320 × 740. Coverage includes signup, unchecked-consent validation, privacy policy round-trip with fields retained, username/email login, forgot-password/reset flow, password visibility, and guest listening. Eye-button geometry is checked against its input before/after toggling on both login and signup (including mobile) to catch visual drift.
- The Google Fonts stylesheet is fulfilled locally in the login flow test so a transient CDN failure cannot make the interaction check nondeterministic; product fallback fonts remain available.
- Frontend production build completed successfully. Vite emitted the repository's existing large-chunk advisory (>500 kB); it is unrelated to this visual change.
- Direct side-by-side visual comparison was performed on the reference and captured Login/Signup states. The `12ui` CLI installer could not start under this Windows environment (`spawn EINVAL`); browser-based inspection and direct viewport measurements were used instead.
# Authentication compact-window follow-up — 2026-10-09

- **Source:** `C:\Users\member\Pictures\Screenshots\Screenshot 2026-10-09 171230.png`. The app frame leaves a 1365×672 renderer viewport; the sign-up card in the source extends below the window, hiding the footer action.
- **Implementation captures:** `frontend/design-qa-evidence/auth-approved/auth-signup-short-1365x672.png` and `auth-login-short-1365x672.png`; mobile captures at 320×568 and 390×844 are in the same directory.
- **Compared state:** clean sign-up and sign-in pages, no account data entered. The original microphone-studio background remains visible behind the glass card.
- **Result:** At 1365×672, both cards are centered and all form controls, actions, and account-switch links are within the viewport. At 320×568 and 390×844, both forms also fit without document scrolling or horizontal overflow. At very short viewport heights (460px or less, e.g. with a mobile keyboard open), natural vertical scrolling remains available so focused fields are reachable.
- **Root cause/fix:** The approved auth stylesheet overrode older compact-height rules. Added scoped compact-height rules in the approved stylesheet for desktop and mobile without changing the background treatment or auth flow.
- **Verification:** Playwright auth regression group: 8 passed, 4 skipped (other project-specific cases); frontend lint and production build passed; desktop package tests: 83 passed.
- **Result:** PASS for tested viewports.

## Listener Channel Collections row — 2026-10-09

- The supplied 1270×164 screenshot shows the Channel profile's Collections list: its collection cover was omitted and the native-looking “View” action lacked the surrounding Echoo styling.
- Added the normalized Collection cover as a compact thumbnail, a responsive three-column cover/title/action row, and a clear blue outlined action with hover and keyboard-focus treatment.
- Regression verifies that cover art is present, the action is styled, the row does not overflow at 390px, and activation still opens the selected Collection.
- Verification: listener-collection-row.spec.mjs passed on the 390px mobile project; ESLint passed.
- **Result:** PASS for the tested mobile profile view.
