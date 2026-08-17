# Echoo end-to-end smoke test

Run this checklist against the `integration/echoo-core-cleanup` branch before merging it to `main`.

## Services

Expected local services:

- MongoDB
- Redis
- Echoo backend on port `5001`
- LiveKit on port `7880`
- Echoo frontend on port `5174`

The current MVP does not require OvenMediaEngine or LiveKit Egress for direct listening.

## 1. Authentication and roles

1. Register or log in as a creator.
2. Complete creator onboarding.
3. Confirm Creator Studio opens.
4. Register/log in as a listener in another browser profile/device.
5. Confirm Listener Home opens.

Expected: no fake creator/listener data is inserted into empty UI states.

## 2. Station single-authority check

1. Open Creator Studio → Stations.
2. Create one station.
3. Open Creator Studio → Live.
4. Open Creator Studio → Schedule.

Expected:

- Stations is the only place with station creation controls.
- Live only selects an existing station.
- Schedule only selects an existing station.
- A duplicate station name returns a clear conflict instead of creating another record.

## 3. Go Live Now

Creator:

1. Open Live.
2. Select the station.
3. Enter title/description.
4. Test microphone.
5. Save setup.
6. Confirm the Broadcast is saved as `scheduled`, not `live`.
7. Press Go Live.

Expected lifecycle:

```text
scheduled → starting → creator connects to LiveKit → live
```

Expected UI:

- creator microphone test ends before the real LiveKit microphone starts
- Creator Live switches to LIVE state
- reconnect microphone is available
- listener/peak counts are real values

## 4. Listener direct audio

Listener in a second browser/device:

1. Open Live.
2. Find the creator's real live Broadcast.
3. Open it.
4. If the browser blocks autoplay, press `Tap to hear audio`.

Expected:

- real creator microphone is audible
- listener cannot publish microphone/media
- no Egress/OME is required
- listener count increases after presence synchronization

## 5. Live Chat realtime

1. Send a message from the listener.
2. Open another listener session and join the same broadcast.
3. Send another message.
4. React to a message.
5. From the creator account, pin/unpin a message.
6. Remove an owned/moderated message.

Expected:

- messages persist through REST/MongoDB
- Socket.IO delivers chat/status/presence changes without 5-second fake polling
- REST refresh remains a recovery fallback

## 6. End broadcast

Creator:

1. Press End Broadcast.

Expected:

```text
live → ending → completed
```

Expected:

- LiveKit publisher disconnects
- station becomes offline
- live listener count becomes zero
- listener room displays ended state
- broadcast disappears from Live discovery
- completed peak listener snapshot is retained for analytics

## 7. Schedule Later

Creator:

1. Open Schedule.
2. Select an existing station.
3. Enter title/date/start time/duration.
4. Schedule.
5. Confirm status is `scheduled`.
6. Press Enter Studio.
7. Confirm the same Live workspace opens with that Broadcast loaded.
8. Run microphone check.
9. Start the Broadcast.

Expected:

- Schedule does not create a second station
- scheduled and immediate flows converge on one Live Studio
- scheduled Broadcast becomes live only through the explicit lifecycle

## 8. Following

Listener:

1. Follow a creator.
2. Follow a station.
3. Open Library → Following.
4. Confirm both relationships are present.
5. Unfollow each.

Expected:

- creator and station follow relationships are separate
- following does not gate public listening
- creator receives a real new-follower notification when enabled

## 9. Notifications

1. Open Notifications.
2. Mark one read.
3. Mark all read.
4. Delete one.
5. Follow a creator from another account.
6. Start a public broadcast from a followed creator/station.

Expected:

- notification records are real backend data
- no sample notifications appear
- links open the real Echoo destination

## 10. Library and playlists

1. Save a real public audio track.
2. Open Library.
3. Confirm it appears under Saved Audio.
4. Create a playlist.
5. Add the saved track to the playlist.
6. Play it from the playlist.
7. Remove from Saved Audio.
8. Delete the playlist.

Expected: saved audio/playlists are backend data, not localStorage mock collections.

## 11. Search

Search for a real creator/station/audio title.

Expected:

- real matching audio
- real creators
- real stations
- real public playlists
- honest empty results for nonexistent terms
- no `Faith Talk Live`, sample broadcast or mock creator substitution

## 12. Upload/content

Creator:

1. Upload a supported audio file.
2. Confirm `/uploads/audio/...` is reachable through the backend/frontend proxy.
3. Confirm unsupported non-audio files are rejected.
4. Confirm private content is not returned by public discovery.

## 13. Settings

Listener and creator:

- update display name/bio
- update notification settings
- change email with current password
- change password

Expected: account changes are persisted by backend settings endpoints.

## 14. Empty account test

With an account that has no data:

Expected states include:

- No one is live right now.
- No public audio has been published yet.
- You're not following anyone yet.
- No saved audio yet.

Expected: no bundled mock audio, fake listeners, fake creators, fake analytics or fake broadcasts.
