# Echoo Listener Mobile V2

Branch: `integration/listener-mobile-v2`

## Listener experience completed

### Home
- Approved listener-first light/dark visual direction
- Dynamic greeting and Echoo discovery hero
- Real public Live Now broadcasts and measured listener counts
- Search and category entry points
- Real Top Stations ordered by listener/follower activity
- Account-aware library/sign-in call to action
- No fabricated stations, listeners, notifications or Premium subscription state

### Primary navigation
- Home
- Library
- Search
- Favorites
- Profile

Live remains a listener feature through Home/search/menu rather than occupying a primary tab. Creator tools are intentionally outside Listener V2 navigation.

### Account and session
- Real login and registration endpoints
- Access/refresh session flow
- iOS/Android credentials stored with Expo SecureStore
- Guest discovery remains available without an account
- Real logout and expired-session handling

### Search and discovery
- Debounced real backend search
- Audio, stations and live broadcasts
- Category-to-search routing
- Honest loading, empty and failure states

### Library and Favorites
- Real saved audio
- Real followed stations
- Real listening history
- Real library stats
- Saved audio routes into the player
- Followed stations route into station profiles

### Stations
- Real public station profile
- Real creator/owner details
- Real follow/unfollow state
- Live status from the Broadcast source of truth
- Live station routes into the listener room

### Published audio player
- Real published media URL
- Play/pause
- 15-second forward/back seek
- Progress and duration
- Save/unsave to Echoo Library
- Share action

### Live listener room
- Backend-issued authenticated listener LiveKit token
- Receive-only room connection
- Native audio session
- Current listener presence refresh
- Leave and pause/resume controls
- Official Expo/LiveKit native dependencies and config plugins added

### Notifications
- Real backend notification inbox
- Real unread count in the top-bar bell
- Mark individual notification read
- Mark all read
- Delete notification
- Relevant station/live notification routing
- Guest sign-in state

### Profile, menu and settings
- Real account profile state
- Library statistics
- Guest state
- Logout
- Listener hamburger menu
- Light/dark system appearance
- Device notification settings entry point
- Playback/download/privacy information surfaces

## Data-honesty rules

Listener V2 does not invent content when the backend is empty. Empty live rooms, stations, favorites, library content, search results and notifications render explicit empty states.

The reference mockup's Premium promotion is not presented as an active subscription product because the current Echoo backend does not expose a Premium/subscription authority.

## Validation

The branch-closing GitHub Actions validation passed:

- `npm ci` — 0
- `npm run lint` — 0
- `npx tsc --noEmit` — 0
- `npx expo config --type public` — 0

See `mobile/LISTENER_V2_VALIDATION.md` for the recorded output.

The permanent Echoo GitHub Actions workflow now also includes mobile install, lint and TypeScript validation.

## Runtime gate before merge

Static/config validation is complete. Before merging to `main`, run the native app on Android/iOS with the real backend and a LiveKit-capable development build and smoke-test:

1. Light and dark Home layouts on representative phone sizes.
2. Login/register/logout and session refresh.
3. Search → station profile → follow/unfollow.
4. Search/Library/Favorites → published audio playback and save/unsave.
5. Creator goes live → listener joins → audio is audible → listener cannot publish → presence updates → leave room.
6. Notification creation → unread badge → inbox → mark read/read-all/delete.
7. Library history and saved content refresh after navigation/relaunch.
8. Android/iOS safe-area, keyboard, back navigation and audio-route behavior.

No runtime-device smoke test is claimed by this document until those steps are executed on a native development build.
