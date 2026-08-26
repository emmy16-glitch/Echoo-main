ECHOO - CODEX CLOUD IMPLEMENTATION PROMPT
Browser Parakeet V3 + Gemini 3.5 Transcribe + Provider Fallback Architecture
Cloud-ready complete prompt - Sections 0 through 44

IMPORTANT: YOU ARE RUNNING IN CODEX CLOUD.
 
The GitHub repository and base branch have already been selected by the user in the Codex Cloud UI.
 
Repository:
emmy16-glitch/Echoo-main
 
Selected base branch:
design/echoo-vibecurb-redesign
 
Do NOT switch to main.
Do NOT run git switch to another existing branch.
Do NOT attempt to recreate the selected base branch.
Do NOT force push.
Do NOT push directly to GitHub during the implementation.
 
Work inside the Codex Cloud task workspace created from the selected base branch.
 
You may make logical local commits inside the task workspace if appropriate.
 
At completion, leave all changes available for Codex Cloud's normal diff / Create PR handoff.
 
The intended feature name for this work is:
 
feat/parakeet-gemini-transcription
 
If Codex Cloud automatically creates/manages its own task branch, use that mechanism rather than fighting it with manual git branch switching.
 
============================================================
ECHOO PARAKEET + GEMINI TRANSCRIPTION IMPLEMENTATION
============================================================
 
You are working inside the ECHOO repository.
 
Your task is to implement ECHOO's new production-grade transcription architecture end-to-end.
 
DO NOT treat this as a small experiment.
DO NOT merely install packages and stop.
DO NOT create a disconnected demo.
DO NOT replace or damage the existing ECHOO audio mixer, LiveKit broadcasting, recording, transcript persistence, creator review, quality-processing, Socket.IO, authentication, MongoDB, or current UI behavior.
 
The goal is to integrate:
 
1. Browser-based NVIDIA Parakeet V3 as ECHOO's PRIMARY live transcription engine.
2. Gemini 3.5 Transcribe Live as an OPTIONAL secure cloud fallback.
3. Gemini 3.5 Transcribe as an OPTIONAL post-broadcast quality provider.
4. A provider-independent ECHOO transcription architecture so Parakeet, Gemini and the existing Whisper implementation can coexist without coupling the rest of ECHOO to any one STT vendor.
5. Automatic model loading/caching so creators never manually install or download Parakeet.
6. Reliable failure handling so transcription can NEVER bring down a live broadcast.
7. Preserve all current transcript/session/history/review functionality already implemented.
 
============================================================
0. GIT AND SAFETY - CODEX CLOUD
============================================================
 
First inspect the repository and the task workspace.
 
Run:
 
git status
git branch --show-current
git log --oneline -10
git remote -v
 
The selected base branch in Codex Cloud is:
 
design/echoo-vibecurb-redesign
 
Do NOT work directly on main.
Do NOT switch away from the Codex Cloud-managed task branch/workspace unless absolutely required by the platform.
Do NOT create a competing local branch if Codex Cloud already created one for this task.
 
The intended feature name is:
 
feat/parakeet-gemini-transcription
 
Do NOT:
- force push
- rewrite history
- delete user work
- merge to main
- push automatically
- commit secrets
- commit .env
- commit model binaries
- commit node_modules
- commit generated browser caches
- commit hundreds of MB/GB of Parakeet model files
 
Logical local commits are encouraged after each major completed stage.
 
============================================================
1. FIRST UNDERSTAND THE EXISTING SYSTEM
============================================================
 
Before writing code, perform a real architecture audit.
 
ECHOO already has substantial transcription infrastructure.
 
Inspect at minimum:
 
backend/src/services/transcriptionGateway.js
backend/src/services/transcriptPersistenceService.js
backend/src/services/transcriptQualityService.js
backend/src/services/broadcastProcessingService.js
backend/src/config/env.js
 
backend/src/models/TranscriptSession.js
backend/src/models/TranscriptSegment.js
backend/src/models/BroadcastAudioChunk.js
backend/src/models/BroadcastProcessingJob.js
backend/src/models/Broadcast.js
 
the Socket.IO initialization and room architecture
 
the broadcast routes/controllers
 
the LiveKit integration
 
the frontend Creator Studio
 
the existing audio mixer
 
the exact source of the current post-master PCM sent toward Whisper
 
the current recording pipeline
 
the existing AudioWorklet / MediaRecorder / Web Audio capture code
 
the transcript-related frontend hooks/services/components
 
the replay transcript/review UI
 
Do NOT assume file names beyond those that actually exist.
 
Trace the real runtime:
 
Creator inputs
-> Web Audio mixer
-> master bus
-> LiveKit
-> current transcription capture
-> backend
-> TranscriptSession
-> TranscriptSegment
-> creator/replay UI.
 
Document the REAL route/component/service flow before changing it.
 
Create:
 
docs/transcription/parakeet-gemini-audit.md
 
Include:
- current source of master audio
- current sample rate
- current PCM format
- how frontend sends transcription audio
- current Whisper coupling points
- current TranscriptSession lifecycle
- current TranscriptSegment lifecycle
- current quality-processing lifecycle
- current Socket.IO transcript events
- current recording lifecycle
- what can be reused unchanged
- what must be refactored
- risks
 
IMPORTANT:
Reuse existing infrastructure wherever possible.
 
Do not create a second transcript database.
Do not create a second broadcast state machine.
Do not create duplicate transcript models.
Do not build another independent recorder if a suitable post-master capture already exists.
 
============================================================
2. NON-NEGOTIABLE ECHOO MEDIA ARCHITECTURE
============================================================
 
The authoritative audio path is:
 
Host microphone
Guest audio
Music / FX
Screen / tab audio
        |
        v
ECHOO Web Audio Mixer
        |
        v
master limiter/output
        |
        v
echoo-studio-mix
        |
        +--------> LiveKit -> listeners
        |
        +--------> recording
        |
        +--------> transcription tap
 
THIS MUST REMAIN TRUE.
 
Transcription is a SIDE-CAR.
 
Never put:
 
Parakeet
Gemini
Whisper
MongoDB
Socket.IO
 
between the creator and LiveKit listeners.
 
The following must ALWAYS remain possible:
 
Creator
-> ECHOO mixer
-> LiveKit
-> listeners
 
even if every transcription provider is unavailable.
 
A transcription crash/failure MUST NOT end or interrupt a broadcast.
 
============================================================
3. TARGET TRANSCRIPTION ARCHITECTURE
============================================================
 
Implement this conceptual architecture:
 
                    ECHOO MASTER MIX
                           |
          +----------------+----------------+
          |                                 |
          v                                 v
       LiveKit                    transcription audio tap
          |                                 |
          v                                 v
      listeners                    mono PCM / 16 kHz
                                            |
                                  TranscriptionOrchestrator
                                            |
                    +-----------------------+------------------+
                    |                       |                  |
                    v                       v                  v
           Browser Parakeet          Gemini Live         existing Whisper
             PRIMARY                 FALLBACK              OPTIONAL
                    |                       |                  |
                    +-----------------------+------------------+
                                            |
                                            v
                                   canonical transcript
                                            |
                                   existing backend API
                                            |
                                  TranscriptSegment
                                            |
                                       MongoDB
                                            |
                                      Socket.IO
                                            |
                                 Creator transcript UI
 
 
POST-BROADCAST:
 
Final/master recording
        |
        +------ Parakeet/raw transcript
        |
        +------ Gemini 3.5 Transcribe quality pass OPTIONAL
                        |
                        v
                 reconciliation
                        |
                 validation gate
                        |
                 creator review
                        |
                 final replay transcript
 
============================================================
4. INSTALL REQUIRED PACKAGES
============================================================
 
Verify the existing package managers and lockfiles first.
 
The repo currently uses npm unless the actual package files indicate otherwise.
 
FRONTEND:
 
Install the current compatible version of:
 
parakeet.js
 
Do NOT guess internal model file names.
 
Use the library's current public API/types.
 
Initial target API is expected to resemble:
 
import { fromHub } from 'parakeet.js'
 
const model = await fromHub('parakeet-tdt-0.6b-v3', {
  backend: 'webgpu',
  ...
})
 
and:
 
const streaming = model.createStreamingTranscriber()
 
But VERIFY this against the installed package README/types.
 
Use the current package API, not copied stale snippets.
 
BACKEND:
 
Install the official current Gemini JS SDK:
 
@google/genai
 
Use it server-side for:
- Gemini configuration
- ephemeral Live API token minting
- post-broadcast/file transcription
 
Do NOT install unofficial Gemini wrappers unless absolutely required.
 
Preserve package-lock files.
 
Run npm audit only for awareness; do not perform destructive major-version upgrades unrelated to this work.
 
============================================================
5. CREATE A PROVIDER-INDEPENDENT TRANSCRIPTION LAYER
============================================================
 
Refactor the current provider coupling.
 
Do NOT remove Whisper yet.
 
Create a clean abstraction that represents a transcription provider.
 
Use repository naming conventions, but conceptually it should support:
 
TranscriptionProvider
 
properties/capabilities:
- id
- kind: local | cloud
- supportsLive
- supportsQuality
- supportsTimestamps
- supportsConfidence
- supportsCustomVocabulary
- supportsLanguageDetection
- requiresNetwork
 
lifecycle:
- initialize()
- isSupported()
- start()
- pushAudio()
- flush()
- stop()
- dispose()
 
events:
- status
- partial
- final
- error
- metrics
 
Do not overengineer this into microservices.
 
The browser implementation belongs in the frontend.
 
Backend provider implementations belong in the backend.
 
The canonical ECHOO transcript schema remains provider-independent.
 
Current provider-specific fields such as:
provider
providerSegmentId
model
confidence
language
etc.
 
should continue to work.
 
============================================================
6. BROWSER PARAKEET: PRIMARY PROVIDER
============================================================
 
Implement BrowserParakeetProvider.
 
This is ECHOO's default live STT provider.
 
Requirements:
 
A. NO MANUAL INSTALLATION
 
The creator must NEVER be required to:
 
- visit Hugging Face
- manually download a model
- select an ONNX file
- install Python
- install NVIDIA software
- install a desktop program
- paste filesystem paths
 
The creator simply enters Creator Studio.
 
ECHOO handles model initialization automatically.
 
B. MODEL LOADING
 
Initial architecture:
 
Creator enters Broadcast Studio
       |
       v
check cached model
       |
if present -> load cache
       |
if absent -> automatically fetch model
       |
IndexedDB cache
       |
model ready
 
Use parakeet.js's built-in Hugging Face/IndexedDB functionality where appropriate.
 
DO NOT build another giant custom IndexedDB cache unless needed.
 
DO NOT commit the model to Git.
 
Initially use the library's supported remote model mechanism.
 
However architect model source configuration so ECHOO can later switch to:
 
ECHOO CDN/object storage
/models/parakeet/...
 
without changing transcription logic.
 
Suggested configuration concepts:
 
VITE_PARAKEET_ENABLED=true
VITE_PARAKEET_MODEL=parakeet-tdt-0.6b-v3
VITE_PARAKEET_MODEL_SOURCE=hub
 
Do not put secrets in Vite variables.
 
C. VERIFY ACTUAL MODEL SIZE
 
Do NOT hardcode claims such as "400 MB".
 
Determine the actual model assets selected by the installed package/configuration.
 
Document:
- model
- quantization
- approximate first-load bytes
- subsequent cached behavior
 
If exact size cannot be determined programmatically, say that honestly.
 
D. WEB WORKER
 
Parakeet inference MUST NOT run on the React/UI main thread.
 
Use a dedicated Web Worker.
 
Conceptually:
 
React
  |
  v
TranscriptionOrchestrator
  |
  v
parakeet.worker
  |
  v
parakeet.js
  |
  v
ONNX Runtime Web
 
Messages should include:
 
INIT
READY
AUDIO_CHUNK
PARTIAL
FINAL
FLUSH
STOP
ERROR
METRICS
 
Use transferable ArrayBuffers where possible to avoid unnecessary audio-copy overhead.
 
E. AUDIO CAPTURE
 
DO NOT create a second microphone capture.
 
Tap the SAME ECHOO master mix that is published to LiveKit.
 
Inspect the existing Whisper/live transcription PCM capture.
 
If the existing browser pipeline ALREADY produces:
 
16 kHz
mono
PCM
 
reuse that.
 
If not, create a dedicated post-master transcription tap using Web Audio.
 
Prefer AudioWorklet over deprecated ScriptProcessorNode.
 
Required input to Parakeet:
 
mono Float32Array
16,000 Hz
 
Implement high-quality sample-rate conversion if the ECHOO AudioContext is 44.1/48 kHz.
 
Do not alter the master bus sample rate merely for STT.
 
Audio delivery remains untouched.
 
F. STREAMING
 
Use Parakeet's current streaming API.
 
Conceptually:
 
createStreamingTranscriber()
 
pushAudioChunk(chunk, 16000)
 
Generate:
 
partial transcript
final/committed transcript
 
Do NOT append every partial result permanently.
 
Maintain:
 
pending text
committed/final text
 
Only canonical final segments should become final persisted transcript segments.
 
Partial results may be emitted to creator UI as drafts.
 
G. BACKPRESSURE
 
A creator may speak faster than a slow device can transcribe.
 
Implement bounded queues.
 
Track:
- queued audio duration
- processing latency
- real-time factor if measurable
- dropped chunks
- worker responsiveness
 
Never allow unlimited memory growth.
 
If local inference falls substantially behind live audio for a sustained interval:
 
mark provider DEGRADED
 
and allow the orchestrator to switch/fallback appropriately.
 
Do NOT allow Parakeet slowness to freeze:
- mixer
- LiveKit
- recording
- React
 
============================================================
7. BROWSER CAPABILITY DETECTION
============================================================
 
Create a Parakeet capability/preflight service.
 
Check at minimum:
 
- Web Worker support
- AudioWorklet support
- WebAssembly support
- navigator.gpu / WebGPU availability
- browser storage availability
- available storage estimate where exposed
- model load success
- inference readiness
 
WebGPU is preferred.
 
WASM fallback may be supported when practical.
 
IMPORTANT:
Multithreaded WASM can require cross-origin isolation.
 
DO NOT blindly add global:
 
Cross-Origin-Opener-Policy
Cross-Origin-Embedder-Policy
 
without auditing the effect on:
- LiveKit
- images
- external media
- authentication
- current hosting
- third-party resources
 
If single-threaded WASM is safer initially, use it.
 
Document the tradeoff.
 
Provider state:
 
unsupported
initializing
downloading
loading
ready
live
degraded
failed
 
============================================================
