# Creator Home fidelity QA

Reference target: approved Creator Studio dashboard supplied on 2026-08-19.

## Visual checks
- Echoo two-capsule mark + lowercase wordmark in desktop sidebar
- Home, Stations, Broadcast Studio, Audio, Audience, Analytics, Settings visible; no extra Explore Live rail item
- desktop search/header proportions match reference
- hero uses three-column composition with readiness rail and lower-right blue wash
- first dashboard row keeps three equal cards and reference vertical rhythm
- Recent audio uses stored cover artwork when available
- performance period control is interactive, not decorative
- mobile uses a seven-icon bottom rail and no horizontal overflow

## Functional checks
- Create station -> Stations
- Upload audio -> existing upload modal
- View/Open station -> Stations
- View schedule/Schedule for later -> Broadcast scheduling mode
- scheduled broadcast row -> prepared Broadcast Studio session
- Recent audio artwork/title -> full Creator audio player
- Recent audio play/pause -> actual stored file URL
- Recent audio overflow/View all -> Audio workspace
- performance period -> real /studio/analytics period request
- Open Studio -> Broadcast workspace
- Creator settings -> Settings

No dashboard metrics, cover art, listener counts, or audio rows are hardcoded for presentation.
