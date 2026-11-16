# Listener acceptance checks

Code checks do not establish background playback reliability. Run this against
the newly rebuilt app on a physical iPhone and Android phone with a real live
broadcast. No physical phones were connected during the implementation audit.

## Live audio and controls

1. Join as a guest, then repeat signed in. No microphone permission should be requested for listening.
2. Listen with the app visible, switch to another app for five minutes, then lock the screen for ten minutes.
3. Pause/resume with lock-screen controls and a Bluetooth headset. Confirm the in-app state agrees and there is only one audio stream.
4. Test a headset disconnect, a phone call, Wi-Fi/mobile-data handover, and an airplane-mode outage followed by reconnection.
5. Explicitly pause, change network, and return. Recovery must never undo the pause.
6. End the broadcast from another device. The listener should see the ended state and system playback should clear.

## Navigation and sessions

- Throttle the connection, tap audio cards, and swipe the queue. The player shell should respond immediately without duplicate screens or overlapping audio.
- Open a collection, leave before its request finishes, then open another. Only the newly selected collection may appear.
- Sign out/in as another user while personal requests finish. No prior user's profile, playlists, history or download status may be applied.

## Notifications

- Sign in while offline, restore the connection, then start a followed channel's broadcast from another device. Confirm automatic token registration recovers.
- Open the same notification through a cold start and while the app is open. It should open one live room; relaunching must not reopen a consumed notification.
- Deny permission: automatic retries must not repeatedly prompt. Enable permission in system Settings and return to the app: registration should refresh.
- Sign out and confirm future broadcasts no longer notify this device for that account. A failed sign-out request must be shown explicitly.

## Downloads, history and playlists

- Download two tracks concurrently; repeatedly tap one track's Download button. Expect one copy of each track.
- Enable airplane mode, restart the app, play saved tracks, and seek. No stream authorization request should be needed for a valid local file.
- Remove a device copy. Original audio, playlists and other-device records should remain.
- Test more than 50 history entries, more than 100 liked tracks, clearing history, and removing a single history entry.
- Create a private playlist, edit name/description/visibility, reorder tracks, remove a track and delete the playlist. Confirm cancellations change nothing and another user cannot edit it.

Automated checks:

```sh
npm run test:offline
npm run test:background-audio
npx tsc --noEmit
npm run lint
```
