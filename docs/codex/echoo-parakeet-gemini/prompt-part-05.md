33. REAL BROWSER VALIDATION
============================================================
 
When build/tests pass, if environment supports Chromium:
 
run Creator Studio in a browser.
 
Verify:
 
- no horizontal overflow
- no console errors
- LiveKit path still loads
- Studio loads without Parakeet blocking UI
- Parakeet worker initializes
- model-loading state appears
- model cache path works where possible
- microphone path remains unchanged
- mixer remains responsive during STT initialization
 
If WebGPU isn't available in Codex environment:
DO NOT fake success.
 
Document:
 
"WebGPU runtime requires manual real-browser verification."
 
Create clear manual verification steps.
 
============================================================
34. PARAKEET BENCHMARK HARNESS
============================================================
 
Create a developer-only evaluation utility/page/script.
 
We need to benchmark ECHOO's real target audio.
 
It should make it possible to feed the SAME audio file to:
 
- Parakeet
- Whisper if configured
- Gemini quality if configured
 
and collect:
 
provider
duration
processing time
real-time factor
transcript
confidence where available
 
Do NOT send audio to cloud providers unless the developer explicitly opts in.
 
Document that Nigerian English/accent performance must be evaluated empirically.
 
Do not make unsupported claims about accuracy.
 
============================================================
35. PRIVACY
============================================================
 
Document privacy accurately.
 
Parakeet live path:
audio remains in creator browser for inference,
except transcript text sent to ECHOO backend.
 
Gemini fallback:
audio is sent to Google.
 
Gemini quality:
recording/audio segment is sent to Google.
 
Whisper behavior:
depends on configured deployment.
 
Do NOT call Gemini "local" or "private".
 
Do NOT claim free-tier Gemini data handling without current authoritative confirmation.
 
Add:
 
docs/transcription/privacy.md
 
Explain provider behavior plainly.
 
============================================================
36. DOCUMENTATION
============================================================
 
Create/update:
 
docs/transcription/architecture.md
docs/transcription/parakeet-browser.md
docs/transcription/gemini.md
docs/transcription/provider-fallback.md
docs/transcription/testing.md
docs/transcription/privacy.md
 
Include architecture diagrams in text/mermaid where useful.
 
Document:
 
Browser Parakeet
|
v
primary/free/local
 
Gemini Live
|
v
optional fallback
 
Gemini file model
|
v
optional quality provider
 
Whisper
|
v
preserved optional fallback/deployment choice
 
LiveKit
|
v
NEVER depends on STT
 
============================================================
37. ENVIRONMENT DOCUMENTATION
============================================================
 
Update backend/.env.example safely.
 
Example:
 
# Gemini
GEMINI_API_KEY=
GEMINI_LIVE_ENABLED=false
GEMINI_QUALITY_ENABLED=false
GEMINI_LIVE_MODEL=gemini-3.5-transcribe-live
GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe
GEMINI_LIVE_ROTATE_SECONDS=560
GEMINI_LIVE_OVERLAP_SECONDS=5
 
Do NOT add real values.
 
Frontend example:
 
VITE_PARAKEET_ENABLED=true
VITE_PARAKEET_MODEL=parakeet-tdt-0.6b-v3
VITE_PARAKEET_MODEL_SOURCE=hub
 
Only add values the implementation actually uses.
 
============================================================
38. DEVELOPMENT HEALTH/READINESS
============================================================
 
Extend health/readiness diagnostics where sensible.
 
Do not call Gemini on every health check.
 
Report config-level state such as:
 
gemini:
  configured
  liveEnabled
  qualityEnabled
 
Never reveal API key.
 
Parakeet is browser-side, so backend health should not pretend to know a client browser's WebGPU capability.
 
============================================================
39. BUILD / LINT / TEST GATES
============================================================
 
Before declaring completion, run all existing repository validations.
 
At minimum inspect package scripts and run applicable:
 
backend:
npm test
lint if available
 
frontend:
npm run lint
npm run build
frontend tests
 
existing architecture guards
 
existing transcript tests
 
git diff --check
 
Do NOT weaken existing tests to make new code pass.
 
Do NOT remove tests.
 
Do NOT add eslint-disable everywhere.
 
Fix actual issues.
 
============================================================
40. REQUIRED MANUAL TEST PLAN
============================================================
 
Produce exact steps for me to test on my device.
 
Include:
 
TEST A - normal Parakeet
 
1. start backend
2. start frontend
3. enter Creator Studio
4. observe automatic transcription preparation
5. allow microphone
6. speak
7. see partial/final transcript
8. start broadcast
9. listener receives audio
10. transcription does not affect audio
11. end broadcast
12. review persisted transcript
 
TEST B - model cache
 
1. load model once
2. reload Studio
3. verify cached load
4. confirm no manual download required
 
TEST C - Gemini fallback
 
1. configure API key server-side
2. enable Gemini Live
3. intentionally disable Parakeet in dev config
4. start Studio
5. verify ephemeral token flow
6. verify Gemini live transcript
7. verify no permanent API key appears in browser network responses/source
 
TEST D - 10-minute rotation
 
Provide a DEV-ONLY shortened rotation setting e.g. 60-90 seconds so rotation can be tested without waiting 10 minutes.
 
Verify:
- next session created
- transcript continues
- overlap is deduplicated
- no broadcast interruption
 
Never make shortened timing the production default.
 
TEST E - all STT disabled
 
Disable:
Parakeet
Gemini
Whisper
 
Start broadcast.
 
Listener MUST STILL receive audio.
 
This is a mandatory acceptance test.
 
============================================================
