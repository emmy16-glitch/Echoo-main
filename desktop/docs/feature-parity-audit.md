# Echoo Windows desktop feature-parity and verification audit

Original conversion baseline: `bbf38537f88a7faf77373524fa541d41e6f4b9df`

This document is the current acceptance record for the one canonical Windows
application in `desktop/`. The original baseline was a hosted Electron shell;
the current application is a locally packaged Windows client.

Status terms:

- **IMPLEMENTED** — the production path exists in current source.
- **AUTOMATED VERIFIED** — repository/Windows CI exercises the contract.
- **MANUAL HARDWARE VERIFY** — implementation exists, but real Windows hardware
  or a real production account/session is still required for final human proof.
- **NOT VERIFIED** — do not claim the behavior is proven yet.

## Current architecture

```text
Echoo.exe
  -> bundled React/Vite renderer
  -> echoo-app://app
  -> context-isolated preload (window.echooDesktop)
  -> Electron main process for Windows-native capabilities
  -> shared Echoo production API + LiveKit
```

The packaged application does **not** load `https://echoo.digi02.org` as its
normal UI. The public site origin is retained only for public links/browser
handoff. The installer does not ship Express, MongoDB, a private Echoo backend,
Render credentials, LiveKit signing secrets, JWT secrets, database credentials,
or other server authority.

The backend explicitly allows the exact packaged renderer origin
`echoo-app://app` rather than accepting opaque `Origin: null` pages.

## Windows package contract

| Area | Status | Evidence |
| --- | --- | --- |
| Product/version | IMPLEMENTED | `Echoo`, package `echoo-desktop`, version `2.0.0` |
| Platform | IMPLEMENTED | Windows 10/11 x64, NSIS only |
| Installer | AUTOMATED VERIFIED on prior green Windows run | `Echoo-Setup-2.0.0-x64.exe`, `.blockmap`, `latest.yml` |
| Local renderer | IMPLEMENTED + AUTOMATED VERIFIED | `frontend-dist` is built, packaged, loaded from `echoo-app://app` |
| Offline shell independence | IMPLEMENTED; latest Windows CI must remain green | installed smoke mode blocks remote HTTP(S) and still requires the local renderer + bridge to render |
| Windows identity/icon | IMPLEMENTED | app ID `com.echoo.desktop`, checked-in high-resolution Echoo icon, tray icon |
| macOS/Linux release paths | REMOVED | no DMG/AppImage targets, notarization hook, or mac/Linux app lifecycle branch |
| Code signing | MANUAL/CI CREDENTIAL DEPENDENT | Authenticode is used only when signing credentials are supplied securely |

## Security boundary

| Contract | Status |
| --- | --- |
| `contextIsolation: true` | IMPLEMENTED + TESTED |
| `nodeIntegration: false` | IMPLEMENTED + TESTED |
| Renderer sandbox | IMPLEMENTED + TESTED |
| Raw `ipcRenderer`/Node APIs hidden from React | IMPLEMENTED |
| Narrow preload capability surface | IMPLEMENTED + CONTRACT TESTED |
| External navigation guarded | IMPLEMENTED + TESTED |
| Default browser handoff limited to safe HTTP(S) | IMPLEMENTED + TESTED |
| Local file operations path-contained/trusted | IMPLEMENTED + TESTED |
| Server secrets absent from renderer build inputs | IMPLEMENTED + TESTED |
| Microphone permission limited to Echoo renderer/audio | IMPLEMENTED + TESTED |
| System-audio capture requires user gesture + source choice | IMPLEMENTED + TESTED |
| Packaged CORS origin is exact `echoo-app://app` | IMPLEMENTED + TESTED |

## Creator parity

The desktop renderer uses the real Creator application rather than a separate
replacement Creator product, so existing Channel, Broadcast, Recordings,
Collections, Schedule, Analytics, Audience, Notifications, and Settings routes
remain available.

| Creator capability | Status | Notes |
| --- | --- | --- |
| Existing Creator Studio mental model | IMPLEMENTED | Host/guest/media/master workflow preserved; no duplicate setup wizard |
| Microphone selector | IMPLEMENTED | Existing Studio control remains authoritative |
| Device hot-plug detection | IMPLEMENTED + CONTRACT TESTED | `devicechange`, disconnect, bounded recovery, final unavailable state |
| Windows default-input recovery | IMPLEMENTED + TESTED | preserves "system default" intent instead of retrying stale hardware ID |
| Monitor-output disconnect fallback | IMPLEMENTED + TESTED | falls back to Windows system default with visible status |
| Explorer audio drag/drop | IMPLEMENTED + TESTED | scoped to the media source target |
| System/tab audio choice | IMPLEMENTED + TESTED | native Electron source menu; no silent screen capture |
| Go Live state | IMPLEMENTED + TESTED | one control: Go Live -> Connecting -> LIVE; duplicate activation blocked |
| LIVE truthfulness | IMPLEMENTED | UI follows confirmed broadcast/publisher state |
| Reconnect | IMPLEMENTED + existing repository tests | bounded recovery; Studio remains usable instead of becoming an infinite reconnect page |
| End Broadcast | IMPLEMENTED + TESTED | existing confirmation flow; tray/quit cannot bypass it |
| Creator background lifecycle | IMPLEMENTED + TESTED | closing active window hides to tray; power blocker remains scoped to live creator work |
| Live recording/recovery | IMPLEMENTED + existing tests | server authority preserved; local safety copy/recovery remains available |
| Real physical-device/live production session | MANUAL HARDWARE VERIFY | requires a Windows machine, actual mic/output devices, and real authorized broadcast |

## Listener parity

The desktop renderer uses the real Listener application, preserving discovery,
live rooms, chat, creators/channels, search, library, collections, playlists,
history, downloads, notifications, profile, settings, and recorded-audio pages.

| Listener capability | Status | Notes |
| --- | --- | --- |
| Guest/authenticated discovery | IMPLEMENTED | same product routes/data contracts as Web |
| Live playback/chat | IMPLEMENTED + repository tests | real LiveKit listener path retained |
| Bounded reconnect | IMPLEMENTED + repository tests | reconnect supervisor cannot remain pending forever |
| Background live audio | IMPLEMENTED | active live session can remain in tray |
| Recorded persistent player | IMPLEMENTED | playback continues across Listener routes |
| Windows media-session controls | IMPLEMENTED | Media Session handlers already drive recorded/live playback |
| Tray live/replay distinction | IMPLEMENTED + TESTED | live room and replay actions do not collide |
| Open public page in browser | IMPLEMENTED + TESTED | uses Windows default browser |
| Real production playback session | MANUAL VERIFY | requires production network/account/content |

## Native Windows capabilities

| Capability | Status |
| --- | --- |
| Single instance | IMPLEMENTED |
| Cold-start `echoo://` deep link | IMPLEMENTED + INSTALLED-APP TESTED |
| Second-instance `echoo://` routing | IMPLEMENTED + INSTALLED-APP TESTED |
| Tray | IMPLEMENTED + TESTED |
| Native notifications + preferences | IMPLEMENTED + TESTED |
| Auto launch | IMPLEMENTED; real user-profile behavior requires Windows/manual confirmation |
| Window size/position/maximized restore | IMPLEMENTED + TESTED |
| Off-screen/multi-monitor bounds defense | IMPLEMENTED + TESTED |
| Windows app/taskbar identity | IMPLEMENTED |
| Taskbar recording-save progress | IMPLEMENTED + TESTED |
| Power-save blocker | IMPLEMENTED + TESTED |
| Native text context menus | IMPLEMENTED + TESTED |
| Open/Show in File Explorer | IMPLEMENTED + TESTED |
| Native Save dialog for explicit recording export | IMPLEMENTED + TESTED |
| Rename / Recycle Bin for trusted recording files | IMPLEMENTED + TESTED |
| Open logs | IMPLEMENTED + TESTED |
| Default browser handoff | IMPLEMENTED + TESTED |
| Auto update | IMPLEMENTED + TESTED for gating/artifact contract |
| Update deferral while live/listening/recording-save active | IMPLEMENTED + TESTED |

## Recording / large-file contract

- Long desktop saves use begin/chunk/finish/abort IPC; a recording is not sent as
  one giant renderer-to-main-process buffer.
- IPC chunks are bounded to 8 MiB; the legacy one-shot compatibility path is
  bounded to 16 MiB.
- Writes use a partial file, sync, then atomic commit.
- Interrupted non-empty partials are preserved for recovery.
- Quit waits for main-process recording streams to flush/preserve before exit.
- Automatic copies use the managed Echoo Recordings library. Explicit exports
  use a native Save dialog and remain trusted only for that process lifetime.
- Taskbar progress is determinate when total size is known and indeterminate
  otherwise.
- A real multi-hundred-megabyte Windows save should still receive MANUAL
  LARGE-FILE VERIFY before release sign-off.

## Startup, recovery, and motion

| Area | Status |
| --- | --- |
| Local branded splash | IMPLEMENTED + TESTED |
| Actual Echoo mark | IMPLEMENTED |
| No fake percent/progress | IMPLEMENTED + TESTED |
| Main window hidden until ready | IMPLEMENTED + TESTED |
| No intentional splash delay | IMPLEMENTED |
| Reduced-motion handling | IMPLEMENTED + TESTED |
| Renderer crash recovery | IMPLEMENTED + TESTED |
| Local offline/error page + retry | IMPLEMENTED + TESTED |
| Installed renderer with remote HTTP(S) blocked | IMPLEMENTED; latest Windows CI must remain green |
| Last useful Creator/Listener workspace restore | IMPLEMENTED + TESTED |
| Desktop-specific layout scoping | IMPLEMENTED + TESTED; web CSS is not globally overridden |
| Decorative particles/shimmer/large bounce | REMOVED + TESTED |

Motion is intentionally short and state-driven. It communicates pending/live,
save/recovery, navigation continuity, and feedback; it is not a showreel.

## Release / CI evidence

The Windows workflow performs, in order:

1. locked dependency install;
2. desktop security/package contract tests;
3. local renderer build + bundle verification;
4. Windows x64 NSIS build;
5. silent install of the produced installer;
6. installed-app launch;
7. local-renderer / secure-bridge smoke verification;
8. cold-start and second-instance deep-link checks;
9. offline local-shell smoke with remote HTTP(S) blocked;
10. signing-state report;
11. verified artifact upload; and
12. tagged-release publication only after verification.

A prior Windows workflow at
`a1b23c47cfc30ba4e0c026b224f76f2b075c7a15` completed successfully after the
local-renderer/permission/deep-link hardening. Newer commits must also be green
before final release sign-off.

## Items that must not be falsely called verified

- Authenticode signing if `CSC_LINK` / `CSC_KEY_PASSWORD` are unavailable.
- Physical USB microphone/output hot-plug on a real Windows workstation.
- Seven-hour production Creator broadcast from the packaged client.
- Real production Listener session from the packaged client.
- Very large (hundreds of MiB / multi-hour) local recording save on real disk.
- 100% / 125% / 150% Windows display scaling visual review.
- Any production backend deployment step that has not actually been deployed and
  health-checked.

Those are environment/hardware verification items, not reasons to reintroduce a
hosted web wrapper, a bundled backend, or a second desktop application.
