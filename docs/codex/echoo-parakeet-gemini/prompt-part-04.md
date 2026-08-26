23. PARAKEET MODEL FAILURE DURING BROADCAST
============================================================
 
If the worker crashes:
 
- mark local provider failed
- attempt worker restart ONCE if safe
- do not replay old audio indefinitely
- retain already committed transcript
- transition to Gemini fallback if enabled
- otherwise use existing Whisper provider if configured
- otherwise transcription becomes unavailable
 
The UI should say something like:
 
"Cloud transcription fallback active"
 
or:
 
"Live transcription unavailable. Your broadcast is still live."
 
NEVER:
"Broadcast failed"
 
because of STT.
 
============================================================
24. PERFORMANCE AND MEMORY
============================================================
 
Add lightweight diagnostics.
 
Track locally:
- Parakeet initialization ms
- model load/cache hit where detectable
- audio queue duration
- transcription processing ms
- real-time factor where possible
- worker restart count
- fallback count
- provider switches
- dropped STT chunks
 
Do NOT log raw audio.
 
Avoid logging full transcripts by default.
 
Expose development diagnostics behind dev mode or a debug flag.
 
Monitor memory carefully.
 
Dispose:
- workers
- audio nodes
- Gemini sockets
- timers
- rotation timers
- event listeners
 
when leaving/stopping the studio.
 
No leaks across repeated broadcasts.
 
============================================================
25. CREATOR STUDIO UI
============================================================
 
Do NOT redesign the Studio.
 
Respect existing VibeCurb/UI work.
 
Add only necessary transcription states in the existing design system.
 
Possible user-facing state:
 
Transcription
Preparing...
Ready
Live
Using cloud fallback
Unavailable
 
Do not make the creator choose:
 
Parakeet
WebGPU
WASM
Gemini endpoint
 
Normal users should see product behavior, not infrastructure.
 
Optional advanced/debug area may expose provider information.
 
Do NOT block Go Live because Parakeet is still loading.
 
If Parakeet isn't ready:
broadcast can start,
then use Gemini fallback if available,
or enable Parakeet once ready if provider switching policy allows.
 
============================================================
26. LISTENER CAPTIONS
============================================================
 
Preserve current product behavior.
 
Do not suddenly publish raw draft transcripts to every listener unless ECHOO already has a designed listener caption feature.
 
Live drafts should remain compatible with existing creator-side infrastructure.
 
If listener live captions already exist:
feed them only canonical approved/final live segments according to existing behavior.
 
Do not accidentally expose creator-only transcript review events.
 
============================================================
27. RECORDING AND REPLAY
============================================================
 
Do not alter the existing authoritative recording path unless required.
 
Recording must remain independent of STT.
 
At broadcast end:
 
1. stop live publication normally
2. finalize recording
3. flush Parakeet
4. flush/persist pending live transcript
5. complete current quality processing
6. optionally run Gemini quality job
7. reconcile
8. validation gate
9. creator review
10. publish replay
 
Gemini failure must NOT prevent replay from being generated if Parakeet/raw transcript exists.
 
============================================================
28. EXISTING WHISPER CODE
============================================================
 
Do NOT delete Whisper code in this branch.
 
Current Whisper components may remain useful as:
 
- fallback
- comparison provider
- deployment option
- regression reference
 
Refactor Whisper behind the provider abstraction where practical.
 
Environment variables such as:
 
WHISPER_FLOW_URL
WHISPER_FLOW_API_KEY
WHISPER_QUALITY_FLOW_URL
WHISPER_QUALITY_FLOW_API_KEY
WHISPER_MODEL
 
must remain backward compatible unless a very good reason exists.
 
Mark legacy/deprecated paths clearly if necessary.
 
No breaking migration without tests.
 
============================================================
29. CONFIGURATION PRIORITY
============================================================
 
Desired default policy:
 
Parakeet browser:
ON by default for eligible Creator Studio browsers.
 
Gemini Live:
feature flag + API key required.
 
Gemini quality:
feature flag + API key required.
 
Whisper:
preserve configuration.
 
A possible backend feature endpoint can tell frontend only NON-SECRET capability flags:
 
{
  parakeetEnabled: true,
  geminiLiveEnabled: true/false,
  geminiQualityEnabled: true/false,
  whisperFallbackEnabled: true/false
}
 
Do not reveal secrets or sensitive infrastructure URLs unnecessarily.
 
============================================================
30. TESTING - FRONTEND
============================================================
 
Add tests for:
 
- capability detection
- provider priority selection
- Parakeet supported path
- Parakeet unsupported path
- Parakeet initialization failure
- Parakeet worker crash
- fallback to Gemini
- fallback disabled
- no provider available
- partial vs final behavior
- bounded audio queue
- transcript upload retry
- provider switching
- proper cleanup on stop/unmount
- model preload only on Creator Studio
- Listener does not download Parakeet
- cache initialization error handling
 
Mock WebGPU where needed.
 
Do not require a real large model download in unit tests.
 
============================================================
31. TESTING - GEMINI ROTATION
============================================================
 
Add strong unit tests for:
 
- rotation timer starts
- token refresh before new session
- next session becomes ready
- audio overlap
- previous session closes
- no gap in provider state
- 2 rotations
- 10+ rotations
- network failure during rotation
- token endpoint failure
- old socket closes unexpectedly
- duplicate transcript suppression
- broadcast absolute offset continuity
- timer cleanup on broadcast stop
 
Use fake timers.
 
Do NOT require real Gemini credentials for normal CI.
 
============================================================
32. TESTING - BACKEND
============================================================
 
Add tests for:
 
Gemini ephemeral token endpoint:
- unauthenticated denied
- listener denied if creator permission required
- wrong broadcast denied
- creator allowed
- Gemini disabled
- missing API key
- provider SDK failure
- secret never included in response
 
Transcript ingestion:
- ownership
- idempotency
- provider validation
- sequence validation
- time validation
- duplicate final segment
- malicious provider values
- oversized transcript
 
Gemini quality provider:
- success normalization
- timeout
- 429
- 4xx
- 5xx
- malformed response
- quality fallback to raw
- creator edit protected
 
============================================================
