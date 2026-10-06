# Echoo Windows desktop architecture

## Target runtime

```text
Echoo.exe
  -> bundled local Vite renderer at `echoo-app://app` (React, HashRouter)
  -> context-isolated preload (`window.echooDesktop`)
  -> Electron main process (Windows/native capabilities)
  -> shared Echoo production API + LiveKit
```

The renderer is local application code, not a remotely hosted UI. A privileged
`echoo-app://app` protocol gives that local bundle one stable, non-null origin,
so the production API can allow exactly the desktop client rather than trusting
all opaque `file://` origins. Network failure may make server-backed content
unavailable, but it must not prevent the application shell from rendering.

## Ownership boundaries

- **Renderer:** Echoo UI, routing, user interactions, authenticated API calls,
  LiveKit client behavior, truthful operation state, and recoverable errors.
- **Preload:** a small typed-by-convention capability surface. It sanitizes
  renderer inputs and never exposes raw Electron or Node APIs.
- **Main process:** windows, splash, protocol handling, tray, notifications,
  power management, filesystem streams/dialogs, default-browser handoff,
  updater, preferences, and diagnostics.
- **Backend:** authentication/authorization, shared product data, LiveKit token
  issuance, broadcast authority, server recording/finalization, trimming,
  messages, schedules, and analytics.

## Packaging contract

- A desktop renderer build is generated specifically with a relative asset
  base and the public production API origin.
- Only public client configuration may be embedded. No server secrets are build
  inputs.
- The renderer output, preload, main process, offline/startup UI, and real Echoo
  icons are verified before `electron-builder` runs.
- The supported release target is Windows 10/11 x64 using NSIS. The installed
  product name is **Echoo** and the target artifact is
  `Echoo-Setup-<package-version>-x64.exe`.

## Security invariants

- `contextIsolation: true`, `nodeIntegration: false`, and renderer sandboxing
  remain enabled.
- IPC channels are allowlisted and payload/path/scheme inputs are validated in
  the main process.
- Only `http:` and `https:` destinations approved by policy can be handed to
  the default browser; shell commands and executable paths are never accepted.
- File operations are limited to user-selected files and the configured Echoo
  recording library.
- LiveKit API secrets and participant-token signing remain server-side.

## Product invariants

- Creator and Listener are workspaces of the same Echoo account and share the
  same backend data with the web client.
- Creator Studio keeps the existing sources/mixer/master/broadcast mental model.
- No duplicate microphone onboarding flow is introduced.
- Local creator device copies stay independent of canonical server recording.
- A LIVE label is shown only after actual backend/LiveKit confirmation.
- Native behavior complements the product; it does not duplicate backend
  business logic or create a second Echoo platform.
