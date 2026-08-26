41. ACCEPTANCE CRITERIA
============================================================
 
This task is NOT complete until:
 
[ ] Creator browser automatically loads Parakeet
[ ] no manual model installation is needed
[ ] model cache is reused
[ ] inference runs off the UI thread
[ ] audio comes from ECHOO master mix
[ ] Parakeet can produce live partial/final text
[ ] canonical final text reaches existing transcript persistence
[ ] broadcast continues when Parakeet fails
[ ] Gemini Live fallback exists behind feature flag
[ ] permanent Gemini API key never reaches frontend
[ ] ephemeral-token flow is implemented if current SDK supports it
[ ] Gemini session rotation is implemented and tested
[ ] overlap deduplication works
[ ] post-broadcast Gemini quality adapter exists
[ ] raw transcript is preserved
[ ] creator edits are preserved
[ ] quality validation exists
[ ] Whisper path is not destructively removed
[ ] no duplicate transcript database created
[ ] LiveKit behavior remains unchanged
[ ] recording behavior remains unchanged
[ ] backend tests pass
[ ] frontend lint passes
[ ] frontend build passes
[ ] git diff --check passes
[ ] documentation exists
[ ] no secret committed
[ ] no model binaries committed
[ ] manual test plan exists
 
============================================================
42. IMPLEMENTATION ORDER
============================================================
 
Proceed in this order:
 
PHASE 0
Audit actual ECHOO transcription/audio architecture.
 
PHASE 1
Introduce provider abstractions without changing behavior.
 
PHASE 2
Install and implement Browser Parakeet worker/provider.
 
PHASE 3
Connect post-master ECHOO PCM to Parakeet.
 
PHASE 4
Persist Parakeet canonical transcript through existing backend.
 
PHASE 5
Implement capability detection/model preload/cache/status UI.
 
PHASE 6
Implement fallback/orchestrator behavior.
 
PHASE 7
Install @google/genai and implement secure backend Gemini config.
 
PHASE 8
Implement Gemini ephemeral-token endpoint.
 
PHASE 9
Implement Gemini Live frontend provider.
 
PHASE 10
Implement automatic Gemini session rotation + dedupe.
 
PHASE 11
Implement optional Gemini post-broadcast quality provider.
 
PHASE 12
Add custom broadcast vocabulary.
 
PHASE 13
Add validation/reconciliation.
 
PHASE 14
Tests, browser validation and performance checks.
 
PHASE 15
Documentation and final architecture report.
 
Do not stop after Phase 0 unless genuinely blocked.
 
Do not ask me to manually implement routine code you can implement yourself.
 
If external credentials are missing:
implement the feature using mocks/tests/configuration and clearly mark the one final real-service verification step.
 
============================================================
43. COMMITS
============================================================
 
Make logical commits after successful stages.
 
Suggested style:
 
refactor(transcription): introduce provider abstraction
 
feat(transcription): add browser Parakeet provider
 
feat(transcription): connect Parakeet to studio master mix
 
feat(transcription): persist browser transcript segments
 
feat(transcription): add Parakeet preload and capability fallback
 
feat(transcription): add Gemini ephemeral token service
 
feat(transcription): add Gemini live fallback
 
feat(transcription): rotate Gemini live sessions safely
 
feat(transcription): add Gemini replay quality provider
 
test(transcription): cover provider failover and rotation
 
docs(transcription): document ECHOO STT architecture
 
Do NOT push automatically.
 
============================================================
44. FINAL REPORT
============================================================
 
When finished, give me a structured report containing:
 
1. Branch name
2. Architecture before
3. Architecture after
4. All files added
5. All files modified
6. npm packages installed
7. Parakeet model/config actually selected
8. Actual model first-load size if measured
9. Browser cache strategy
10. WebGPU/WASM behavior
11. How audio reaches Parakeet
12. How transcripts reach MongoDB
13. Gemini authentication architecture
14. Gemini rotation design
15. Gemini quality architecture
16. Whisper compatibility status
17. Security/privacy decisions
18. Tests added
19. Tests/build/lint results
20. Any unresolved limitations
21. Exact commands I should run
22. Exact manual test steps
23. git log --oneline for new commits
24. git status
25. Explicit confirmation that no secret/model binary was committed
 
============================================================
CORE RULE TO REMEMBER THROUGHOUT IMPLEMENTATION
============================================================
 
ECHOO is an AUDIO BROADCASTING PLATFORM.
 
Speech-to-text is an enhancement.
 
The architecture must ALWAYS preserve:
 
Creator
   |
   v
ECHOO Mixer
   |
   v
LiveKit
   |
   v
Listener
 
independently of:
 
Parakeet
Gemini
Whisper
transcript processing.
 
If all transcription systems fail simultaneously,
the listener must continue hearing the creator.
