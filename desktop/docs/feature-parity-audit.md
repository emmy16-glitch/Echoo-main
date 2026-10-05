# Echoo Windows desktop feature-parity audit

Baseline commit: `bbf38537f88a7faf77373524fa541d41e6f4b9df`

This audit records the current `main` implementation before the Windows desktop
conversion. It is the parity contract for the canonical application in
`desktop/`; a feature is not complete merely because a matching route renders.

## Current architecture

- `desktop/src/main.js` creates a secure Electron window, but normal packaged
  production still calls `loadURL("https://echoo.digi02.org")`.
- Development loads the Vite server. `frontend/src/App.jsx` already supports a
  `file://` runtime with `HashRouter`, but that path is not used by normal
  packaged production.
- `desktop/src/main.js` contains an unused `frontend-dist/index.html` path. The
  package configuration does not include a renderer build, and no
  `desktop/frontend-dist/` currently exists.
- The default desktop product therefore remains a hosted-web thin client.
- The opt-in local-backend path is development-only and must not be part of the
  normal Windows installer.

## Existing desktop-native capabilities worth preserving

| Capability | Current state | Required work |
| --- | --- | --- |
| Context-isolated preload | Present; Node integration is disabled and sandbox is enabled | Keep narrow and validate every payload |
| Single-instance behavior | Present | Add protocol/deep-link payload routing |
| Tray | Present with room mute/leave and quit | Add accurate listener/creator actions and packaged icon |
| Background room lifecycle | Active rooms hide on close | Verify creator broadcast and listener playback independently |
| Power-save blocker | Driven by renderer room state | Verify it is active only when required |
| Native notifications | Present with persisted event preferences | Validate event type and foreground/background behavior |
| Auto launch | Present | Windows verification required |
| Graceful shutdown | Two-second renderer handshake | Verify LiveKit/socket/recording cleanup |
| Recording save | Chunked begin/append/finish/abort protocol exists | Harden path ownership, add file operations, test large bounded writes |
| Open recordings folder | Present | Restrict arbitrary paths and add show/open actions |
| Auto update | `electron-updater` present | Verify artifact/metadata publication ordering |
| External links | Uses the default browser | Restrict schemes and trusted destinations |
| CSP | Production file-response CSP exists | Activate with the local renderer and test required origins |
| Offline error UI | Code references `offline.html` with inline fallback | Add the missing bundled local UI |

## Web feature inventory to preserve

### Identity and account

- Guest discovery and account registration/sign-in.
- Password reset, profile setup, creator activation, and existing
  Creator/Listener workspace selection.
- Token refresh/session expiry, account profile, preferences, notification
  settings, password/email changes, account deactivation/deletion.

### Creator

- Broadcast workstation and real LiveKit publish flow.
- Host, Guest 1, Guest 2, master output, device selection, levels, mute,
  monitoring, preview, Go Live, reconnect, and End Broadcast states.
- Live chat, listener presence, broadcast settings, captions/transcripts, and
  saved moments.
- Channel/station creation and management.
- Recording library, upload, playback, server trim copies, device export, and
  recovery status.
- Collections, scheduled events, analytics, audience, notifications, and
  creator settings.

### Listener

- Public/listener home and guest listening.
- Search and discovery, live listings, live room playback/chat, station and
  creator profiles, following, and sharing.
- Audio detail/playback, library, collections, playlists, saved moments,
  history, downloads, notifications, profile, and settings.
- Persistent/background player state and playback continuation.

### Shared platform contracts

- The shared production backend remains authoritative for users, content,
  channels, broadcasts, messages, analytics, server recordings, and temporary
  LiveKit participant credentials.
- The installer must contain no LiveKit API secret, JWT secret, database
  credential, storage key, signing credential, or other server secret.
- Raw/original creator audio remains the default. Enhanced processing remains
  opt-in.
- Browser PCM/WAV upload must not be reintroduced into the healthy live path.

## Current build and release gaps

- `desktop/package.json` is version `1.0.6`, describes the app as a hosted thin
  client, and still exposes macOS/Linux targets despite the Windows-only goal.
- The Windows artifact name is structurally correct but not at target version
  `2.0.0`.
- Package `files` references `offline.html`, `assets/`, and `build/`, none of
  which are tracked under `desktop/` at this baseline.
- The package does not build or include `frontend/dist`.
- `npm test --prefix desktop` references missing
  `desktop/test-audio-controls.mjs` and fails before running tests.
- Both desktop workflows reference missing verification scripts and the main
  release workflow does not build the frontend before packaging.
- The release workflow passes LiveKit server secrets into the desktop build
  environment. That must be removed even if the current default build does not
  consume them.
- Local frontend build verification is currently blocked until dependencies
  are installed (`vite` is not present in `frontend/node_modules`).

## Acceptance matrix

Status meanings: `present` means audited in source, `partial` means useful code
exists but the final path is not verified, and `missing` means no complete
implementation was found.

| Acceptance area | Baseline | Exit evidence |
| --- | --- | --- |
| Local packaged renderer | missing | Installed app loads bundled renderer with network unavailable |
| Same production accounts/data | partial | Packaged renderer uses public production API and real account smoke test |
| Creator parity | partial | Creator matrix and real broadcast test pass |
| Listener parity | partial | Listener matrix and real playback test pass |
| Secure preload/IPC | partial | Contract tests plus invalid-payload/path rejection |
| Device hot-plug behavior | partial | `devicechange` test and Windows manual verification |
| Bounded recording save | present | Automated multi-chunk test and real large-file save |
| Native recording operations | partial | Save/open/show/rename/export/delete verification |
| Default-browser handoff | partial | `https:` allow/deny tests and Windows verification |
| `echoo://` deep links | missing | Cold-start and second-instance tests |
| Tray/background behavior | partial | Listener and creator lifecycle tests |
| Notifications | partial | Preference and click-through tests |
| Splash/no white flash | missing | Packaged launch capture and failure-state test |
| Offline shell/retry | missing | App renders local shell with API unreachable |
| Auto update | partial | Tested installer plus matching `latest.yml`/blockmap |
| Windows x64 NSIS installer | partial | Built, installed, launched, and uninstalled on Windows |
| Code signing | missing credentials | Signed only when `CSC_LINK` and `CSC_KEY_PASSWORD` are supplied securely |

## Implementation order

1. Make a deterministic desktop renderer build and package it locally.
2. Switch packaged startup from hosted UI to the local renderer and public API.
3. Add missing assets, offline/startup UI, Windows metadata, tests, and CI gates.
4. Harden native bridge, file operations, external navigation, and deep links.
5. Add desktop shell state, device-change handling, tray/media behavior, and
   restrained motion without changing the web experience.
6. Run creator/listener parity, security, packaged-app, and NSIS installer
   verification; document anything that remains `NOT VERIFIED`.

