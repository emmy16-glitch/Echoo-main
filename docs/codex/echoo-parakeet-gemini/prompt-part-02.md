8. MODEL PRELOAD EXPERIENCE
============================================================
 
Integrate model preparation into Creator Studio.
 
Do NOT wait until the exact second "Go Live" is pressed.
 
When Creator Studio becomes relevant:
 
start lazy preload.
 
Do not download Parakeet for ordinary Listener users.
 
Do not download Parakeet globally for everyone who visits ECHOO.
 
Only Creator/Broadcast Studio should trigger it.
 
Request browser persistent storage where appropriate:
 
navigator.storage.persist()
 
but handle denial gracefully.
 
The creator-facing UI should NOT expose confusing technical implementation details.
 
Good:
 
Preparing transcription...
Transcription ready
Using cloud transcription fallback
Transcription unavailable - broadcast will continue
 
Avoid:
 
Downloading NVIDIA ONNX decoder_joint_model...
 
Developer diagnostics can expose detailed info in dev mode.
 
============================================================
9. TRANSCRIPTION ORCHESTRATOR
============================================================
 
Create one authoritative client-side transcription orchestrator.
 
Default policy:
 
1. Try Browser Parakeet.
2. If Parakeet is supported and healthy:
   use Parakeet.
3. If it is unsupported OR initialization fails OR becomes severely degraded:
   attempt Gemini Live if enabled/configured.
4. If Gemini is unavailable:
   optionally retain current Whisper path if configured.
5. If no provider works:
   disable live transcription gracefully.
6. NEVER affect broadcast audio.
 
The orchestrator must prevent two live providers from both writing duplicate canonical transcript segments unless explicitly operating in comparison/debug mode.
 
Maintain a session identity independent of provider identity.
 
A provider switch should NOT create a new ECHOO broadcast.
 
Provider history may be recorded for diagnostics.
 
============================================================
10. GEMINI CONFIGURATION - SECURITY FIRST
============================================================
 
Add backend config.
 
Example concepts:
 
GEMINI_API_KEY=
GEMINI_LIVE_ENABLED=false
GEMINI_QUALITY_ENABLED=false
 
GEMINI_LIVE_MODEL=gemini-3.5-transcribe-live
GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe
 
GEMINI_LIVE_ROTATE_SECONDS=560
GEMINI_LIVE_OVERLAP_SECONDS=5
 
Do not hardcode API secrets.
 
Update:
backend/.env.example
 
Never print GEMINI_API_KEY.
 
Never return it from an API.
 
Never include it in:
frontend JS
VITE_ variables
Socket.IO payloads
logs
MongoDB
errors sent to clients
 
============================================================
11. GEMINI LIVE FALLBACK - EPHEMERAL TOKEN DESIGN
============================================================
 
IMPORTANT ARCHITECTURE UPDATE:
 
Do NOT expose the permanent Gemini API key to the browser.
 
Prefer Google's CURRENT official ephemeral token flow.
 
Architecture:
 
Creator Browser
      |
      | authenticated request
      v
ECHOO Backend
      |
      | uses GEMINI_API_KEY privately
      v
creates constrained short-lived ephemeral Gemini token
      |
      v
Creator Browser
      |
      | direct Gemini Live WebSocket using ephemeral token
      v
Gemini 3.5 Transcribe Live
 
This avoids routing continuous audio through the ECHOO backend and avoids exposing the long-lived key.
 
Implement an authenticated endpoint conceptually similar to:
 
POST /api/transcription/gemini/live-token
 
Authorization:
existing ECHOO authenticated creator only.
 
Verify:
- user is authenticated
- broadcast exists
- user owns/is authorized for the creator broadcast
- Gemini Live is enabled
 
Mint a token constrained to:
 
model:
gemini-3.5-transcribe-live
 
response modality:
TEXT
 
input audio transcription enabled
 
minimal necessary permissions
 
short expiry
 
ideally one Live connection/use
 
Follow CURRENT @google/genai API/types.
 
Do not invent token APIs if the installed SDK differs.
Read the official SDK declarations and current Google docs.
 
If the current SDK/runtime truly cannot support ephemeral tokens:
implement a secure backend proxy fallback,
but document WHY.
 
Ephemeral tokens are preferred.
 
============================================================
12. GEMINI LIVE AUDIO
============================================================
 
Use the SAME post-master 16k mono transcription PCM.
 
Do not capture the mic separately.
 
Feed Gemini only the transcription copy.
 
Preserve broadcast-time offsets.
 
Receive Gemini incremental input transcription events.
 
Map provider events into ECHOO's canonical:
 
partial
final
status
error
 
Do not let Gemini's native response structure leak through the whole application.
 
Normalize it at the provider boundary.
 
============================================================
13. GEMINI 10-MINUTE SESSION ROTATION
============================================================
 
Gemini Live currently has a maximum session duration.
 
Implement seamless rotation.
 
Do NOT wait for the server to force-close at exactly 10 minutes.
 
Default target:
start rotating around ~9m20s to ~9m30s
with a small overlap.
 
Make timing configurable rather than hardcoding throughout the code.
 
Concept:
 
Session A:
00:00 ---------------- 09:25
 
                       Session B:
                 09:20 ---------------- 18:45
 
Each new Gemini session requires appropriate authentication/ephemeral token handling.
 
Before rotation:
 
1. request a fresh ephemeral token
2. open next Gemini session
3. verify next session is ready
4. overlap a short portion of audio
5. stop old session only after replacement is active
 
Track:
 
broadcastAbsoluteOffsetMs
providerSessionStartedAt
providerSessionIndex
lastFinalText
lastFinalTime
sequence numbers
 
Implement duplicate suppression across the overlap.
 
Do NOT simply append the overlap twice.
 
Create a tested text overlap/deduplication algorithm.
 
Normalize strings when comparing:
- whitespace
- punctuation
- casing where appropriate
 
Prefer conservative deduplication:
losing legitimate words is worse than a small duplicate.
 
Persist provider session diagnostics if useful, but keep ECHOO's TranscriptSession semantics coherent.
 
============================================================
14. GEMINI FREE-TIER/QUOTA FAILURES
============================================================
 
Do not assume Gemini is unlimited.
 
Classify failures:
 
authentication
quota/rate limit
session expired
temporary network
server error
bad request
unsupported model
token failure
timeout
 
For 429/rate limiting:
 
- do not kill broadcast
- surface fallback state
- allow Parakeet/Whisper if available
- apply bounded retry/backoff
- never infinite-loop
 
Do NOT imply to users that Gemini is "unlimited free".
 
============================================================
