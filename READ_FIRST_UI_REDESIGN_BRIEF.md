# READ THIS FIRST — ECHOO COMPLETE UI REDESIGN BRIEF

> **This file is the authoritative product/design brief for the Echoo UI redesign.**
>
> If you are an AI coding/design agent working on this repository, **read this entire file first, then inspect the actual repository before changing code**. Do not begin by generating screens from assumptions. Echoo already has working product logic, backend APIs, live-audio infrastructure, routing, auth, state, Socket.IO and LiveKit integration. The task is to create four highly polished visual interpretations of the existing product while preserving that architecture.

---

## 0. THE TASK IN ONE SENTENCE

Redesign the complete Echoo frontend experience for both **Listeners** and **Creators** into **four genuinely different, production-quality visual directions**, while preserving all existing functionality and wiring, avoiding fake features, avoiding transcripts, and keeping the product calm, mature, audio-first, responsive and coherent.

The four directions are:

1. **Editorial / Paper / Spacious / Asymmetrical / Quiet**
2. **Swiss / Financial / Precise / Structured**
3. **Japanese Minimal + Light Glass / Calm / Restrained / Premium**
4. **Dark Terminal / Tactical / Dense but Controlled**

The four versions must be implemented in a way that makes them easy to preview and compare without duplicating the product's business logic four times.

---

# 1. BEFORE YOU TOUCH THE UI

Do these things first.

### 1.1 Inspect the repository

Read the actual source code, not only this document. At minimum inspect the following areas before implementing:

- `frontend/src/App.jsx`
- `frontend/src/Components/CreatorStudio/`
- `frontend/src/Components/ListenerLive/`
- `frontend/src/Components/ListenerLiveExperience/`
- Listener Home/dashboard components
- Listener Search
- Listener Channels
- Listener Library
- Listener Following
- Listener History
- Listener Downloads
- Listener Audio Detail
- Listener Creator Profile
- Listener Notifications
- Listener Settings
- Creator setup/onboarding
- Creator Broadcast workspace
- `frontend/src/Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx`
- `frontend/src/Components/CreatorStudio/CreatorAudioMixer.jsx`
- `frontend/src/services/echooMixerService.js`
- `frontend/src/services/echooAudioProcessingEngine.js`
- `frontend/src/services/livekitPublisher.js`
- current API service modules used by Listener and Creator components
- current Socket.IO code
- current responsive/layout code
- `backend/src/models/User.js`
- `backend/src/models/Station.js`
- `backend/src/models/Broadcast.js`
- `backend/src/routes/stationRoutes.js`
- `backend/src/routes/broadcastRoutes.js`
- `backend/src/controllers/broadcastLifecycleController.js`
- `backend/src/providers/livekit.js`
- `backend/src/routes/chatRoutes.js`
- `backend/src/routes/followRoutes.js`
- `backend/src/routes/audioRoutes.js`
- `backend/src/routes/listenerRoutes.js`
- `backend/src/controllers/listenerController.js`
- `backend/src/app.js`
- `backend/src/routes/index.js`
- `docs/audio-architecture.md`
- `IMPLEMENTATION_STATUS.md`
- `scripts/architecture-check.mjs`

If documentation and runtime source disagree, prefer the **current runtime source and architecture checks** over old documentation.

### 1.2 Produce a short audit before implementation

Before editing, summarize internally or in your work log:

- current Listener information architecture
- current Creator information architecture
- components that carry business logic and should be preserved
- components safe to heavily restyle/recompose
- repeated UI patterns that can become shared design primitives
- any stale UI or docs that should not be treated as canonical
- current mobile/responsive weaknesses

Do not spend all your time writing an essay. The purpose of the audit is to prove that you understand Echoo before changing it.

---

# 2. WHAT ECHOO ACTUALLY IS

Echoo is an **audio-first live broadcasting and listening platform**.

It is not Spotify.
It is not Discord.
It is not YouTube Live.
It is not a crypto dashboard.
It is not a generic SaaS admin panel.
It is not a traditional DAW.

Echoo's core product model is:

```text
Account
├── Listener experience (default)
└── Creator capability (optional)
    └── Channel
        └── Broadcast
            └── Creator Broadcast Studio
                └── Audio Mixer
                    └── Master Output
                        └── LiveKit
                            └── Listener Live Room
```

The central product idea is not merely “play audio.” Echoo allows a Creator to prepare and operate a real live audio broadcast, mix multiple sources into one final program, publish that program, and allow Listeners to discover and hear it live.

Supporting systems include:

- accounts and profiles
- Creator capability/onboarding
- Channels
- Broadcast scheduling
- Broadcast lifecycle
- real-time live audio
- prerecorded audio
- recordings
- collections
- follows
- live chat
- notifications
- analytics
- library/history/downloads
- search/discovery

All UI work should reinforce this model.

---

# 3. ACCOUNT MODEL: LISTENER AND CREATOR ARE NOT TWO ACCOUNTS

Echoo uses one authenticated identity.

A normal user has Listener capability by default.

A user may additionally gain Creator capability.

Do **not** redesign this as separate “Listener account” and “Creator account” systems.

The user should be able to understand that they have one Echoo identity and can move between a Listener experience and a Creator workspace when Creator capability is available.

The current backend model supports roles/capabilities such as:

- listener
- creator
- admin
- moderator

The redesign should not invent another role model.

Where there is an experience switcher, it should feel like switching workspace/mode, not logging into another account.

---

# 4. PRODUCT TERMINOLOGY

Use terminology consistently.

## Listener

The person consuming Echoo content.

Correct word: **Listener**.

Do not use “Lister.”

## Creator

A Listener account that also has Creator capability.

## Channel

**Channel** is the current product-facing word.

The backend/data model may still use the name `Station`. That is an implementation detail.

Do not casually rename backend models just to match the UI. Do not expose “Station” in places where the product currently uses “Channel.”

Think:

```text
UI wording: Channel
Backend/data wording: Station
```

## Broadcast

A Broadcast is a specific live or scheduled program/show belonging to a Channel.

Example:

```text
Channel: Northern Voices
Broadcast: Thursday Evening Conversations
```

Do not collapse Channel and Broadcast into one thing.

## Mixer

The Mixer is a Creator-side audio subsystem/workspace, not a role.

## Master Output

The final mixed program that the audience receives.

The canonical published LiveKit program track is named:

```text
echoo-studio-mix
```

Do not change this architecture just for presentation.

---

# 5. THE CORE LIVE AUDIO ARCHITECTURE — DO NOT BREAK THIS

The correct conceptual flow is:

```text
Host Mic ──────┐
Second Input ──┤
Guest Mic ─────┤
Music / FX ────┼──> Echoo Mixer ──> Master Output ──> echoo-studio-mix ──> LiveKit ──> Listener
Screen / Tab ──┘
```

The Listener should receive the **final program**, not a pile of independently exposed source tracks.

The browser mixer is real. It uses Web Audio and real media tracks.

The LiveKit publisher is real.

Do not replace this with static waveform animation or fake state.

Do not use a default raw microphone as a fallback in production if the current architecture intentionally requires the mixer master.

Do not publish individual guest/media sources to Listener clients as separate audience audio just because that seems easier to design.

---

# 6. CREATOR MIXER — EXISTING FUNCTIONAL MODEL

The current mixer has important source concepts. Preserve them.

Typical source/channel set:

- **Host Mic**
- **Channel 2 / second input**
- **Guest Mic**
- **Music / FX**
- **Screen / Tab audio**

Internally, code may map these slightly differently, e.g. `channel2`, `guest`, `media`, `screen`. Do not casually change those identifiers unless required.

Each source can carry concepts such as:

- source connected/disconnected
- source label/device
- level meter
- gain
- mute
- solo/listen-only/monitoring
- left/right or overall levels where available
- media playback/seek for media sources

The overall mixer also includes concepts such as:

- Master Output
- master level
- master processing/protection
- monitoring/headphone output
- monitoring output-device selection where supported
- Creator audio settings
- raw/enhanced audio mode
- audio quality profile
- current audio health

The mixer must remain understandable to non-engineers.

### Very important UX rule: Solo / Listen-only

Solo/listen-only is a Creator monitoring function.

It should **not** be visually presented as if it changes what the audience hears.

The UI must make the distinction clear:

```text
Audience Program Controls
vs
Creator Monitoring Controls
```

A Creator should never believe that pressing Listen-only/Solo has removed every other source from the listener program.

### Do not turn Echoo into a DAW

Avoid recreating Ableton, Pro Tools, Logic or OBS complexity.

Echoo should feel powerful but understandable.

Advanced controls should use progressive disclosure rather than keeping every option open all the time.

---

# 7. AUDIO PROCESSING — RESPECT THE EXISTING ENGINE

The current frontend includes an audio processing layer.

It supports concepts such as:

- raw mode
- enhanced mode
- browser capture constraints appropriate to each mode
- noise removal / DeepFilterNet where available
- warmth
- clarity
- de-essing
- volume balancing/compression
- master protection/limiting behavior
- quality profiles

If DeepFilterNet/noise removal fails, the broadcast should still be able to continue where the existing implementation allows it. The UI should communicate a graceful degraded state rather than implying the whole broadcast is dead.

Do not invent processing features the engine does not support.

Do not imply studio-grade technical guarantees that the code does not actually provide.

---

# 8. LIVEKIT — PRESERVE THE REAL MEDIA CONTRACT

Echoo uses LiveKit as its live media distribution layer.

Important implementation behavior:

- Creator token can publish.
- Listener token is receive-only.
- Listener must not be given publish/data permissions simply to simplify UI.
- Creator publishes the mixer master.
- canonical program track is `echoo-studio-mix`.
- Listener playback should target the canonical program.
- LiveKit reconnect/unpublish behavior must not kill the externally owned mixer track.
- production should not silently fall back to synthetic/default mic audio.
- synthetic audio is development/testing-only where already supported.

The Listener Live Room should remain **audio-first**.

Do not invent a giant fake video player area.

---

# 9. BROADCAST LIFECYCLE — PRESERVE THE REAL STATE MACHINE

Broadcast is the authority for scheduling and live lifecycle.

The product supports states/concepts including:

```text
draft
scheduled
starting
live
ending
completed
cancelled
failed
```

Do not simplify the underlying product into only “offline/live.”

The UI does not need to display every internal state everywhere, but it must respond truthfully to them.

The important live transition is conceptually:

```text
Go Live
  ↓
starting
  ↓
LiveKit room / publisher setup
  ↓
Master program published
  ↓
Backend verifies creator program audio
  ↓
live
```

This means pressing **Go Live** must not cause the UI to instantly pretend the user is already broadcasting if the backend is still in `starting`.

Show an intentional connecting/preparing state.

The backend independently verifies creator program audio before confirming live.

Keep this truthfulness in the UI.

### One active broadcast per Creator

Echoo enforces a single-active-broadcast concept for a Creator through backend coordination/lease logic.

Do not create UI that encourages or assumes multiple simultaneous live broadcasts for the same Creator.

---

# 10. CHANNEL / STATION AUTHORITY

Channel is the user-facing product identity.

The backend `Station` model stores Channel data such as:

- name
- slug
- description
- owner
- cover artwork/branding
- category
- tags
- public/private state
- follower count
- derived live/listener state

Important architectural rule:

**Broadcast owns scheduling and live lifecycle.**

Do not reintroduce a separate Channel-level “toggle live” authority or competing Channel scheduler.

Channel `isLive` is derived from Broadcast lifecycle.

---

# 11. CURRENT CREATOR EXPERIENCE — PRIMARY NAVIGATION

The current primary Creator Studio navigation should remain conceptually centered around:

1. **Broadcast**
2. **Channel**
3. **Recordings**
4. **Collections**
5. **Schedule Events**
6. **Analytics**

There may be old routes/components for additional destinations such as Audio, Audience, Discover, Settings or older Creator views.

Do not automatically put every historical route back in the primary navigation.

The architecture checks in this repository intentionally guard against stale/duplicate information architecture.

---

# 12. CREATOR — BROADCAST STUDIO

This is the most important Creator screen.

Treat it as a real operating environment, not a decorative dashboard.

The exact composition should differ between the four visual versions, but the information hierarchy should account for the following.

### Context

- Channel identity
- Broadcast title
- Broadcast description when useful
- Broadcast state
- scheduled context when relevant

### Live control

- Go Live
- connecting/preparing state
- LIVE state
- elapsed time while live
- End Broadcast
- confirmation/ending state where appropriate

### Audio readiness

- connected Host input
- connected additional inputs
- source state
- source level
- Master Output signal
- selected audio quality
- processing status where useful
- connection health

### Audience context

- Listener count
- Live Chat
- other realtime status only when genuinely useful

### Layout principle

Do not put everything into equal-sized dashboard cards.

The Broadcast Studio needs hierarchy.

A good composition may give most space to:

```text
Broadcast context + Mixer + Master Output
```

while secondary areas such as chat/status remain supporting surfaces.

### Long-session comfort

Creators may stare at this screen for a long time.

Avoid:

- constant flashing
- huge saturated live red areas
- excessive motion
- microscopic labels
- endless card borders
- unnecessary status badges

Live should be unmistakable but calm.

---

# 13. CREATOR — PRE-LIVE STATE

Before going live, the Creator should be able to answer these questions immediately:

- What Channel am I broadcasting from?
- What Broadcast am I about to start?
- Is my microphone connected?
- Which additional sources are active?
- Is there actually audio signal?
- Is the Master Output receiving signal?
- Which quality profile is selected?
- Is Echoo ready to start?
- What exactly happens if I press Go Live?

Do not bury basic readiness under technical diagnostics.

Show advanced diagnostics only on demand or where a problem exists.

---

# 14. CREATOR — LIVE STATE

When live, make these obvious:

- LIVE
- elapsed time
- listener count
- current Broadcast
- Channel identity
- connection/audio health
- mixer status
- Master Output
- End Broadcast

Chat may be shown, but it is secondary to the audio operation.

Avoid UI that makes chat look more important than the broadcast itself.

---

# 15. CREATOR — CHANNEL

The Channel page represents the Creator's broadcast identity.

It may include existing data such as:

- artwork
- Channel name
- description
- category
- tags
- visibility/public state
- follower information
- current live state when applicable
- editing controls

Do not make this page look like an ugly database form.

Use strong visual identity while keeping editing practical.

Do not confuse a Creator profile with the Channel itself.

---

# 16. CREATOR — RECORDINGS

Create a calm, professional recordings library around real data and existing actions.

Relevant information may include:

- artwork
- recording/Broadcast title
- Channel
- date
- duration
- status
- visibility
- processing state where supported
- playback/publish/discard or other existing actions

Do not invent transcript management.

Do not add live transcript or caption UI.

Do not pretend processing is complete when the backend says it is still processing.

---

# 17. CREATOR — COLLECTIONS

Collections should feel like intentionally organized Creator content.

Use:

- artwork where available
- collection title
- item count
- relevant visibility/state
- real actions
- high-quality empty state

Avoid turning each collection into an oversized decorative card if a cleaner list/grid is more appropriate.

---

# 18. CREATOR — SCHEDULE EVENTS

Scheduling belongs to Broadcasts.

The Schedule Events UI should help Creators understand upcoming Broadcasts without creating another competing scheduling model.

Useful information includes:

- date
- time
- Broadcast title
- Channel
- recurrence where genuinely supported
- state
- relevant actions

Possible compositions:

- calendar + agenda
- date-grouped agenda
- precise structured timeline

Different visual versions may choose different approaches.

Avoid an unnecessarily complex enterprise-calendar product.

---

# 19. CREATOR — ANALYTICS

Analytics must be based on real data.

Do not invent:

- listener geography
- age/gender demographics
- revenue
- follower-growth curves not supplied by the API
- fake percentages
- fake retention
- fake “AI insights”
- fake trends

Use the real analytics available from Echoo.

When data does not exist, display an intentional empty state.

The Swiss version in particular can make analytics look extremely precise and strong, but it must remain truthful.

Do not create charts merely to fill space.

---

# 20. CURRENT LISTENER EXPERIENCE

The Listener side is a full product, not an afterthought.

Existing routes/areas include concepts such as:

- Home
- Following
- Search
- Live
- individual Live Room
- Channels
- Channel profile
- Collections
- Audio Detail
- Library
- Playlist
- Saved Moments
- History
- Downloads
- Creator Profile
- Notifications
- Settings

The redesign must define a coherent system across the Listener experience, not only Home and Live.

---

# 21. LISTENER — HOME

Listener Home should feel alive without looking crowded.

Depending on actual returned data, useful sections may include:

- greeting
- Continue Listening
- Live Now
- Recommended
- Upcoming Broadcasts
- followed Channels/Creators
- Discover Channels
- recent listening/history

Do not show every possible section simultaneously just because an endpoint returns it.

Use editorial priority and whitespace.

If a section is empty, do not hardcode fake sample content into production.

---

# 22. LISTENER — LIVE DISCOVERY

The Live discovery experience should make it extremely easy to see what is live and start listening.

Current concepts include:

- live Broadcast list
- category filtering
- search
- sorting
- featured live Broadcast
- listener counts

A live result should communicate, with good hierarchy:

- LIVE state
- Broadcast title
- Channel / Creator identity
- category if useful
- listener count
- artwork
- Join/Listen action

Do not decorate every item with six badges.

---

# 23. LISTENER — LIVE ROOM

This is one of Echoo's signature experiences.

It must be **audio-first**.

The Listener should quickly understand:

- what Broadcast they are hearing
- who is broadcasting
- which Channel it belongs to
- whether it is actually live
- current listener count
- whether audio is connecting/listening/reconnecting
- volume/mute
- follow state
- share action
- Live Chat

Do not design a giant fake video viewport.

Use artwork, typography, subtle real audio activity, thoughtful space and conversation instead.

The LiveKit player currently handles states such as:

- connecting
- connected/listening
- reconnecting
- disconnected
- error
- autoplay blocked / tap to start audio

The redesign must preserve these states.

Do not let a Socket.IO/chat/presence failure visually kill a healthy LiveKit audio session.

Audio, chat and presence are related but distinct systems.

---

# 24. LISTENER — LIVE CHAT

Live Chat is supporting interaction, not the center of Echoo.

Support the existing behavior, including where already implemented:

- message list
- sending
- reactions
- message deletion/moderation where authorized
- pinned content where exposed
- realtime Socket.IO updates
- REST fallback/recovery behavior

Do not turn Echoo into Discord.

Avoid:

- server trees
- channel trees unrelated to Echoo Channels
- excessive emoji controls
- floating reactions everywhere
- gamification
- dozens of chat actions
- giant avatars on every line

Keep chat human, readable and quiet.

---

# 25. LISTENER — CHANNEL PROFILE

A Channel profile should communicate:

- Channel artwork/identity
- Channel name
- Creator identity
- category
- description
- follow state
- live Broadcast when currently live
- upcoming Broadcasts where available
- recordings/audio/content where supported

Do not confuse Channel and Creator profile.

---

# 26. LISTENER — CREATOR PROFILE

Creator profile may include real existing data such as:

- display/artist/organization name
- handle
- avatar/logo
- verification where actually present
- biography/about
- Creator/Channel content
- follow state
- live state where available
- published audio

Keep the experience calm and professional.

Do not imitate influencer/social-media products.

---

# 27. LISTENER — PRERECORDED AUDIO DETAIL

Echoo also supports prerecorded audio.

Audio Detail should support existing concepts such as:

- artwork
- title
- Creator
- playback
- progress
- duration
- like
- save
- download where available
- relevant metadata

Keep the player premium but simple.

Do not copy Spotify's information architecture wholesale.

---

# 28. LISTENER — LIBRARY

Library should organize the user's real Echoo relationships and saved content.

Depending on existing implementation, relevant areas can include:

- saved audio
- collections
- playlists
- downloads
- history
- saved moments
- followed content

Use only actual product relationships.

Do not invent fake categories to make the page look fuller.

---

# 29. LISTENER — SEARCH

Search should use real public Echoo data and existing APIs.

Possible real result types include:

- audio
- Creators
- Channels
- collections/content where supported

Use a coherent shared visual language while keeping different result types distinguishable.

Search must remain usable on small screens.

Do not invent unsupported “trending” data.

---

# 30. LISTENER — FOLLOWING

Echoo has separate follow relationships for Creator/users and Channels.

Do not collapse these relationships blindly.

The UI can make them feel coherent, but preserve real API behavior.

Public Broadcast listening should not be incorrectly gated behind a Follow action if the backend allows public listening.

---

# 31. LISTENER — NOTIFICATIONS

Notifications should feel quiet and intentional.

Use hierarchy such as:

- subtle event icon/state
- title
- supporting sentence
- time
- read/unread distinction
- related navigation target

Avoid giant colored notification cards.

Do not fabricate notification types.

---

# 32. SETTINGS

Settings should look like a serious product surface.

Use grouped sections and clear labels.

Respect existing settings such as account, notifications, player/listening preferences and Creator/audio preferences where the code already exposes them.

Avoid a wall of giant rounded cards.

---

# 33. ABSOLUTE RULE — DO NOT ADD TRANSCRIPTS

For this redesign request, **do not add transcript UI anywhere**.

Do not add:

- live transcripts
- subtitle/caption panels
- transcript cards
- transcript editor
- speech-to-text widgets
- transcript tabs
- AI summaries of spoken content
- live caption overlays
- chapter/transcript panels simply because backend code mentions them

Even if the repository contains transcript-related backend functionality or historical UI, that functionality is intentionally outside this redesign request.

Do not use transcripts to make the product look “advanced.”

---

# 34. ABSOLUTE RULE — DO NOT ADD RANDOM AI FEATURES

Do not add features such as:

- AI Copilot
- AI Producer
- AI DJ
- AI broadcast assistant
- AI audience insight cards
- AI summaries
- automatic show notes
- AI chat summaries
- AI-generated analytics
- fake “smart recommendations” panels unrelated to current API behavior

This task is about **designing Echoo well**, not disguising design weakness with AI gimmicks.

---

# 35. REAL DATA ONLY

Production UI must remain wired to real Echoo data.

Do not replace API-driven state with hardcoded arrays.

Do not hardcode fake:

- Channels
- Creators
- Broadcasts
- listener counts
- followers
- comments/messages
- analytics
- recommendations
- recordings
- notifications

A development-only visual fixture/preview system may be used if necessary to demonstrate layouts, but it must be isolated and must never replace production API calls or become the default production data path.

If the real endpoint returns empty data, show a polished empty state.

---

# 36. PRESERVE EXISTING FRONTEND/BACKEND WIRING

This is a UI/UX redesign, not a product rewrite.

Preserve existing:

- authentication
- account state
- Listener capability
- Creator capability
- Creator setup/onboarding logic
- route guards
- API calls
- Broadcast CRUD
- Broadcast lifecycle
- Channel APIs
- LiveKit integration
- Socket.IO integration
- chat APIs
- follow APIs
- presence behavior
- recordings
- collections
- scheduling
- analytics APIs
- audio APIs
- protected audio playback
- library
- history
- downloads
- search
- notifications

If a working component has business logic and event handlers, prefer to preserve that logic and redesign its presentation around it.

Do not create disconnected static replacements for working screens.

A button that worked before redesign should still work after redesign.

Do not leave real actions replaced with:

- `console.log`
- TODO
- fake toast only
- placeholder href
- dummy function
- nonfunctional visual button

---

# 37. DEFAULT RULE — NO BACKEND REDESIGN

Do not redesign MongoDB schemas.

Do not build another API.

Do not invent another data store.

Do not replace Socket.IO.

Do not replace LiveKit.

Do not move Broadcast authority into Channel.

Do not introduce a second scheduling authority.

Do not change account roles simply for UI convenience.

Backend changes should be considered out of scope unless an extremely small compatibility fix is truly necessary for an existing feature.

---

# 38. ARCHITECTURE CHECKS ARE GUARDRAILS, NOT OBSTACLES

The repository contains architecture checks.

Do not delete, disable or bypass them just because a redesign causes them to fail.

The checks exist to prevent stale or duplicate product implementations from returning.

Important invariants include concepts such as:

- one authenticated identity
- Listener default capability
- Creator capability unlocks Creator Studio/Channel
- Broadcast is scheduling/lifecycle authority
- one active Broadcast per Creator
- Creator mixer produces Master Output
- Master Output goes to LiveKit
- Listener receives the final program
- current Creator navigation should not regress to stale destinations
- old role/local-storage patterns should not be reintroduced
- production should not use mock LiveKit tokens/data

If a test/check fails, first understand the architectural reason.

---

# 39. PROTECTED PRERECORDED AUDIO — DO NOT WEAKEN SECURITY

Echoo's prerecorded audio route layer contains file validation and protected streaming behavior.

The redesign must not introduce direct insecure raw file URLs just because they are easier to place in an `<audio>` element.

Continue using existing protected/authorized stream mechanisms and existing playback services.

Do not expose private audio through public static URLs.

---

# 40. REALTIME RESILIENCE

Echoo uses multiple systems:

- REST/MongoDB for persisted/control data
- Socket.IO for realtime product events/chat/presence
- LiveKit for live audio media/presence-related media state

Do not create UI coupling where failure of a secondary realtime feature destroys the primary media experience.

Example:

- chat reconnecting should not stop LiveKit audio
- presence poll failing should not end the Broadcast
- Listener audio can remain healthy while Socket.IO retries

Show isolated, truthful status when appropriate.

---

# 41. THE FOUR VISUAL DIRECTIONS MUST BE GENUINELY DIFFERENT

Do not make one layout and simply switch colors.

Each version should rethink:

- typography
- navigation treatment
- page composition
- hierarchy
- whitespace/density
- use of cards vs open layout
- borders/dividers
- artwork treatment
- list/table/grid treatment
- Broadcast Studio composition
- Mixer composition
- Live Room composition
- player treatment
- status presentation
- empty states
- mobile adaptation
- motion style

The same real Echoo functions should exist underneath all four.

---

# 42. VERSION 1 — EDITORIAL / PAPER

Keywords:

**Editorial / paper / spacious / asymmetrical / quiet**

### Character

Think of a premium independent audio publication translated into software.

The Listener side can feel like browsing a beautifully art-directed audio journal.

The Creator side can feel like a sophisticated modern broadcast desk expressed through editorial composition rather than generic dashboard panels.

### Visual language

- warm white / paper-like backgrounds
- black/ink typography
- one restrained accent where needed
- generous margins
- deliberate asymmetry
- editorial serif/display type paired with a strong neutral sans where practical
- fine rules/dividers
- low card usage
- lots of breathing room
- strong art direction around Channel/Broadcast artwork
- sophisticated type hierarchy
- intentionally uneven compositions that still align to a system

### Broadcast Studio

Consider long horizontal strips, editorial columns, beautifully labeled audio channels and minimal control chrome.

Mixer channels do not have to be equal rounded cards.

Master Output can be a strong compositional anchor.

### Live Room

Could feel like a live magazine/radio feature:

- strong Broadcast title
- art-forward identity
- quiet live status
- Listener count secondary
- player controls integrated elegantly
- chat as a supporting column/sheet

### Avoid

- glass everywhere
- bright gradients
- card grids
- floating dashboard widgets
- bubbly SaaS components
- overly symmetrical 12-column layouts
- decorative clutter

### Conceptual references only

Think of the restraint associated with high-end independent editorial design, Monocle/Kinfolk-like spacing, culture journals and sophisticated radio branding, without copying any specific brand.

---

# 43. VERSION 2 — SWISS / FINANCIAL

Keywords:

**Swiss / financial / precise / structured**

### Character

This version should feel extremely organized, trustworthy, exact and fast.

Use Swiss International Typographic Style principles plus the clarity of high-end financial/institutional interfaces, without becoming cold or unreadable.

### Visual language

- rigorous grid
- strong alignment
- clean grotesk sans
- excellent tabular numerals
- thin rules
- white / off-white / graphite
- restrained accent
- restrained radius
- minimal shadows
- disciplined spacing
- tables and aligned metadata when tables genuinely help
- clear visual ordering of operational information

### Broadcast Studio

This direction can use a strong modular operational grid.

- Broadcast identity/header
- readiness/status strip
- aligned source channels
- meters with exact numerical context where useful
- Master Output visually distinct
- live statistics arranged with precision

### Analytics

This direction should make analytics especially strong.

Use real data only.

Numbers, labels, comparisons and charts should feel exact and institutional.

### Listener

Do not let the Listener side become a stock terminal.

Keep the same precision but soften information density for discovery/listening surfaces.

### Avoid

- giant rounded pills
- childish icons
- gradients
- decorative illustrations
- random floating cards
- huge empty hero sections that reduce usefulness
- Bloomberg-level density everywhere

---

# 44. VERSION 3 — JAPANESE MINIMAL + LIGHT GLASS

Keywords:

**Japanese minimal / calm / restrained / glass / modern / light / premium**

### Character

The interface should almost feel quiet enough to disappear around the audio.

Combine Japanese-inspired restraint and intentional negative space with carefully used modern translucent material.

Do not turn this into a generic glassmorphism template.

### Visual language

- soft light background
- pale surfaces
- dark ink typography
- subtle borders
- generous breathing room
- restrained rounded corners
- controlled blur only where layered material is useful
- delicate shadows
- careful grouping
- calm micro-motion
- minimal ornament
- strong spatial rhythm

### Glass rule

Glass is a material, not the entire design.

Good uses:

- floating player
- compact live control surface
- overlay sheet
- secondary command surface

Bad use:

- every card transparent
- dozens of overlapping blur panes
- giant colorful gradients behind glass

### Broadcast Studio

Think of premium Japanese audio equipment:

- simple
- controlled
- tactile
- precise
- reassuring

The mixer should feel like high-end audio hardware made approachable.

### Listener

The Listener interface should feel intimate, calm and focused on the current audio rather than on interface chrome.

### Avoid

- neon
- heavy gradients
- huge glass blobs
- Apple clone styling
- extreme corner radii everywhere
- excessive shadow
- decorative sakura/Japanese motifs; this is about design philosophy, not stereotypes

---

# 45. VERSION 4 — DARK TERMINAL / TACTICAL

Keywords:

**Dark terminal / tactical / dense but controlled**

### Character

A professional broadcast operations environment with dark graphite surfaces and extremely clear state.

This is NOT cyberpunk.
This is NOT hacker UI.
This is NOT Matrix green.
This is NOT gaming HUD design.

### Visual language

- deep charcoal / near-black backgrounds
- off-white primary text
- restrained status colors
- subtle separators
- compact spacing where useful
- controlled density
- limited technical/mono typography for metadata only
- strong audio meters
- clear focus states
- precise operational hierarchy
- minimal glow

### Creator Broadcast Studio

This direction should be especially strong here.

It can feel closest to real professional broadcast hardware while remaining usable by ordinary Creators.

Use clear zones:

```text
Broadcast State
Sources / Mixer
Master Output
Monitoring
Audience / Chat
```

### Listener

The Listener side should still feel premium and comfortable.

Do not dump the full control-room aesthetic onto ordinary listening screens.

### Avoid

- neon cyan outlines everywhere
- glowing sci-fi borders
- fake command line
- hex dumps
- crosshairs
- circuit-board backgrounds
- Matrix text
- gamer dashboard styling
- dense tiny text simply to look technical

---

# 46. DESIGN PREVIEW / VERSION SWITCHING

The user needs to **see and compare all four versions**.

Implement a development-safe way to switch design direction without duplicating the app's business logic.

A good approach could be query-based, e.g.:

```text
?design=editorial
?design=swiss
?design=zen
?design=terminal
```

or an equivalent development-only design selector.

Do not make four entirely separate hardcoded apps.

Prefer shared:

- APIs
- hooks
- state
- business logic
- event handlers
- data models
- routing

while variant-specific presentation controls:

- tokens
- typography
- spacing
- surface treatment
- navigation composition
- page layout
- visual components
- density

A design variant can legitimately have a significantly different composition, but it should still consume the same real application state.

---

# 47. DESIGN TOKENS

Each direction needs an intentional token system rather than scattered magic values.

Define at minimum:

- page background
- primary surface
- secondary surface
- elevated surface
- text primary
- text secondary
- text muted
- border
- subtle border
- accent
- live/danger
- success
- warning
- focus
- typography families
- heading scale
- body scale
- label scale
- numeric scale
- spacing scale
- corner-radius scale
- shadow system
- blur system where applicable
- motion duration
- easing
- meter/state colors

Prefer CSS variables/theme objects/design tokens that can be consumed consistently.

Do not scatter arbitrary hex/radius/spacing values across every component.

---

# 48. TYPOGRAPHY

Typography is a major part of the differentiation.

Use professional fonts that are practical for production, preferably existing, open-source or system-safe.

Do not require expensive licensed fonts just to match a screenshot.

Suggested direction only:

- Editorial: expressive serif/display + restrained sans
- Swiss: precise grotesk + tabular numeric treatment
- Japanese/Glass: quiet modern sans with controlled spacing
- Terminal: modern sans + limited mono for operational metadata

Do not make the Terminal version monospace everywhere.

Keep body copy highly readable.

---

# 49. ICONOGRAPHY

Use one coherent icon family per implementation where practical.

Avoid mixing unrelated icon styles.

Do not use emoji as primary interface icons.

Use labels where icon-only controls could be ambiguous, especially for:

- monitoring
- mute
- Go Live
- End Broadcast
- follow
- share
- input/output device selection

---

# 50. THE CARD RULE

Do not solve every layout problem with a rounded card.

Before adding a card, consider:

- whitespace
- alignment
- type hierarchy
- section boundary
- divider
- background zone
- column/grid grouping

Cards should represent actual independent surfaces/objects, not every heading and number.

Avoid nested card-inside-card-inside-card design.

This requirement is especially important for making Echoo feel unique rather than like a generated Tailwind dashboard.

---

# 51. SPACING AND INFORMATION DENSITY

The product should feel clean.

Do not cram controls together simply to show everything at once.

Also do not waste half the screen on oversized decorative titles.

Avoid:

- six tiny actions in one narrow row
- 11px text as a default
- giant hero banners inside functional workspaces
- endless badges
- huge dead empty space that pushes critical controls below the fold
- dense technical labels that non-audio users cannot understand

Aim for mature balance.

---

# 52. ASYMMETRY

The Editorial and Japanese directions should not be forced into identical centered SaaS grids.

Thoughtful asymmetry is encouraged.

Examples:

- large Broadcast identity balanced by a narrow live status rail
- artwork offset against metadata
- mixer occupying a wider field while chat becomes a quiet supporting column
- asymmetric section starts and editorial whitespace

Asymmetry must remain intentional and usable.

---

# 53. RESPONSIVENESS

All four directions must work on:

- wide desktop
- laptop
- tablet
- mobile

Do not merely stack every desktop panel vertically on mobile.

Design mobile deliberately.

### Listener mobile

Listener mobile should feel simple and almost native.

Priorities:

- current audio
- Live status
- primary playback controls
- navigation
- discovery
- chat access
- follow/share

### Creator mobile/tablet

Creator Studio is complex.

On smaller screens preserve:

- Go Live / End Broadcast
- Broadcast status
- Master Output visibility
- core source controls
- readable meters
- microphone/source state
- critical connection state

Use techniques such as:

- horizontally scrollable channel strips
- drawers/sheets
- collapsible advanced controls
- sticky live command bar
- focused source editor

Avoid horizontal page overflow and microscopic faders.

---

# 54. ACCESSIBILITY

Preserve or improve:

- semantic buttons/links/forms
- keyboard navigation
- visible focus state
- readable text size
- color contrast
- touch target size
- screen-reader labels for icon-only controls
- reduced-motion preference
- focus trapping/restoration in dialogs where current code already handles it

Do not sacrifice accessibility for minimalism.

Live/error/success state should not depend on color alone.

---

# 55. MOTION

Motion should be subtle and purposeful.

Good:

- smooth page/section entrance
- restrained hover/focus feedback
- real meter movement
- polished state transitions
- subtle drawer/sheet movement
- calm live-state change

Bad:

- constantly floating cards
- bouncing buttons
- unnecessary parallax
- giant springs
- pulsing every live element
- animated gradients everywhere

Remember that Creator screens may remain open for hours.

---

# 56. LOADING, EMPTY AND ERROR STATES

Do not design only the perfect-data screenshot.

Create polished states for at least:

- initial loading
- section loading
- no live Broadcasts
- no Channel yet
- no recordings
- no collections
- no scheduled events
- no analytics data yet
- empty library
- no history
- no downloads
- no notifications
- no search results
- LiveKit connecting
- waiting for Creator/program
- audio autoplay blocked
- reconnecting
- microphone/source unavailable
- API error
- failed Broadcast start
- Broadcast ending

Do not use fake content to hide empty states.

---

# 57. LIVE / STATUS DESIGN

Support truthful visual distinction for concepts like:

- Offline
- Draft
- Scheduled
- Preparing
- Connecting
- Live
- Ending
- Completed
- Failed

Do not render every state as a huge colored pill.

Use typography, iconography, subtle color and contextual placement.

LIVE can be more prominent, but keep it controlled.

---

# 58. DO NOT FAKE TECHNICAL METRICS

If the frontend has access to real publisher diagnostics such as bitrate, packet/connection or codec information, advanced diagnostic UI may expose them where useful.

Do not invent measurements.

Do not show a fake “99.9% quality” score unless such a value genuinely exists.

Do not use decorative random meter values.

---

# 59. DESKTOP APP CONTEXT

The Electron desktop app largely shells the production web application and adds desktop-specific integration such as:

- tray
- room active state
- mute/unmute
- leave room
- desktop notifications
- reopen/fullscreen/reload behavior

Do not create a separate incompatible Creator visual system exclusively for desktop unless the existing architecture requires it.

The web redesign should remain the canonical visual experience that desktop can host.

---

# 60. MOBILE APP CONTEXT

There is an Expo/React Native mobile project as well.

The current web Creator workflow is the clearest/canonical place for the professional mixer experience.

Do not assume every desktop Creator control must be duplicated unchanged into native mobile in this redesign unless the existing mobile code already supports it.

However, the design system and Listener concepts should remain coherent across platforms.

---

# 61. IMPLEMENTATION QUALITY

Do not create one giant component per page.

Reuse existing logic and create visual primitives only when they genuinely help.

Reasonable primitives could include ideas such as:

- `EchooPage`
- `EchooSection`
- `EchooSurface`
- `EchooArtwork`
- `EchooMeta`
- `EchooLiveIndicator`
- `EchooEmptyState`
- `EchooStatus`
- `EchooIconButton`

These names are examples, not mandatory.

Do not abstract every `<div>`.

Keep the code readable and easy to maintain.

---

# 62. DO NOT DESTROY WORKING CODE TO GET A CLEAN SCREENSHOT

Do not:

- remove API hooks because mock data is easier
- disconnect LiveKit because a static player is easier
- remove Socket.IO because chat can be faked
- remove edge states because they clutter a design
- replace forms with nonfunctional mockups
- remove permissions/state checks
- delete responsive logic without replacing it
- bypass architecture tests

A beautiful disconnected mock is not an acceptable result.

The goal is a **beautiful real Echoo**.

---

# 63. IMPLEMENTATION ORDER

A recommended order is:

### Phase 1 — Understand and protect

- audit current UI architecture
- identify business-logic boundaries
- run baseline checks/tests where practical
- establish four design token systems
- establish development-only variant switching

### Phase 2 — Shared shell

- global typography
- page surfaces
- navigation
- top-level responsive shell
- shared buttons/forms/statuses

### Phase 3 — Signature Listener experience

- Listener Home
- Live discovery
- Live Room

### Phase 4 — Signature Creator experience

- Broadcast Studio
- Mixer
- Channel

### Phase 5 — Remaining Listener surfaces

- Following
- Search
- Channel profile
- Creator profile
- Audio Detail
- Library
- playlists/collections/saved moments as applicable
- History
- Downloads
- Notifications
- Settings

### Phase 6 — Remaining Creator surfaces

- Recordings
- Collections
- Schedule Events
- Analytics
- relevant Creator settings/workflows already in the current product

### Phase 7 — Responsive polish

- wide desktop
- laptop
- tablet
- mobile

### Phase 8 — State/accessibility polish

- loading
- empty
- error
- connecting/reconnecting
- keyboard/focus
- reduced motion
- visual consistency

---

# 64. WHAT “CLEAN” MEANS FOR THIS PROJECT

The user specifically does **not** want too many things going on.

Clean does not mean empty.

Clean means:

- strong hierarchy
- only useful information visible at a given moment
- sensible progressive disclosure
- whitespace that improves comprehension
- consistent type
- controlled color
- clear primary actions
- no duplicate controls
- no fake modules
- no visual filler

Whenever deciding between adding another component and improving hierarchy, improve hierarchy.

Whenever deciding between adding another feature and improving composition, improve composition.

Whenever deciding between another badge and clearer typography, choose clearer typography.

---

# 65. VISUAL QUALITY TARGET

The result should not look like:

- generic Tailwind admin dashboard
- generated Dribbble clone
- crypto dashboard
- Spotify clone
- Discord clone
- Apple Music clone
- YouTube Music clone
- OBS clone
- banking app with audio labels
- AI SaaS landing page

The result should feel like Echoo has its own visual identity:

- audio-first
- calm
- mature
- thoughtful
- professional
- modern
- premium
- usable for long sessions

---

# 66. FINAL COMPARISON REQUIREMENT

After implementing all four visual directions, compare them.

Evaluate each direction from 1–10 across:

- Listener experience
- Creator experience
- Broadcast Studio
- Mixer usability
- Live Room
- mobile behavior
- readability
- information density
- premium feel
- distinctiveness
- long-session comfort
- implementation complexity
- suitability for Echoo

Then identify:

- **Best overall direction**
- **Best Creator/Broadcast direction**
- **Best Listener direction**
- **Best mobile direction**
- **Most distinctive direction**

Do not automatically choose the flashiest version.

Judge based on Echoo's real product needs.

---

# 67. FINAL ACCEPTANCE CHECKLIST

Before considering the redesign finished, verify all of the following.

## Product understanding

- [ ] Listener and Creator are still capabilities/experiences of one account.
- [ ] Channel and Broadcast remain distinct concepts.
- [ ] Channel UI wording is not carelessly replaced with backend `Station` terminology.
- [ ] Broadcast remains scheduling/live authority.
- [ ] One-active-Broadcast constraints are respected.

## Live audio

- [ ] Mixer is still real, not mocked.
- [ ] Host/secondary/guest/media/screen source concepts remain supported.
- [ ] Master Output remains the final audience program.
- [ ] canonical program track remains `echoo-studio-mix`.
- [ ] Listener receives the intended program track.
- [ ] Creator monitoring/solo is not misrepresented as audience mixing.
- [ ] Go Live respects starting/verification state.
- [ ] LiveKit wiring remains functional.
- [ ] Reconnect states remain truthful.

## Realtime/product wiring

- [ ] Socket.IO behavior remains functional.
- [ ] Chat remains wired.
- [ ] Presence behavior remains wired.
- [ ] Chat/presence failures do not unnecessarily kill healthy audio.
- [ ] API-backed data remains API-backed.

## Creator

- [ ] Broadcast Studio redesigned in all four directions.
- [ ] Mixer redesigned in all four directions.
- [ ] Channel redesigned.
- [ ] Recordings redesigned.
- [ ] Collections redesigned.
- [ ] Schedule Events redesigned.
- [ ] Analytics redesigned using real data.
- [ ] Current primary Creator navigation does not regress to obsolete nav.

## Listener

- [ ] Home redesigned.
- [ ] Live discovery redesigned.
- [ ] Live Room redesigned.
- [ ] Channel profile redesigned.
- [ ] Creator profile redesigned.
- [ ] Search redesigned.
- [ ] Following redesigned.
- [ ] Library redesigned.
- [ ] Audio Detail redesigned.
- [ ] History/downloads/notifications/settings covered.
- [ ] Empty/error/loading states covered.

## Scope protection

- [ ] No transcript UI added.
- [ ] No live captions added.
- [ ] No random AI features added.
- [ ] No fake analytics added.
- [ ] No fake production data path added.
- [ ] No backend redesign performed unnecessarily.
- [ ] No architecture guards disabled.
- [ ] No insecure raw audio URLs introduced.

## Design quality

- [ ] Four versions are truly different beyond color.
- [ ] Typography differs intentionally.
- [ ] Layout differs intentionally.
- [ ] Mixer composition differs intentionally.
- [ ] Live Room composition differs intentionally.
- [ ] Card usage is restrained.
- [ ] Mobile is intentionally designed.
- [ ] Accessibility remains strong.
- [ ] Motion is calm.
- [ ] Long-session comfort is considered.

---

# 68. THE MOST IMPORTANT INSTRUCTION

Do not treat Echoo as a blank canvas.

It is an existing product with an existing architecture.

Understand the repository first.

Then redesign the interface around the real product.

The central mental model to keep in your head is:

```text
Creator
  ↓
Channel
  ↓
Broadcast
  ↓
Mixer
  ↓
Master Output
  ↓
LiveKit
  ↓
Listener
```

Everything else — chat, follows, recordings, collections, schedules, notifications, analytics, search, library and settings — supports that central experience.

Make the product beautiful without changing what the product fundamentally is.

**Less, but better.**

**No transcripts.**

**No fake features.**

**No fake data.**

**No broken wiring.**

**Four genuinely different, world-class Echoo interfaces built over the same real application.**
