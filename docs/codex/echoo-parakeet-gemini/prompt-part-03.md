15. LIVE TRANSCRIPTION MODE POLICY
============================================================
 
For LIVE captions:
 
favor literal/verbatim transcription behavior.
 
Do NOT rely on Gemini Smart mode as the unquestioned source of live truth.
 
Keep transformations conservative during the live broadcast.
 
Reason:
spoken content can contain instructions/phrasing that should be transcribed literally rather than interpreted.
 
Live:
raw/literal first.
 
Post-broadcast:
quality processing may be more aggressive, while preserving raw text.
 
============================================================
16. GEMINI POST-BROADCAST QUALITY PROVIDER
============================================================
 
Implement a backend Gemini quality provider using:
 
gemini-3.5-transcribe
 
This should be OPTIONAL and feature-flagged.
 
Do not make publishing dependent upon Gemini availability.
 
Integrate with the EXISTING ECHOO quality/replay pipeline.
 
Do NOT create a second transcript store.
 
Quality input should be the authoritative master recording or existing durable quality audio pipeline.
 
First inspect how completed recordings are stored and accessed.
 
Do not fake a path that doesn't exist.
 
Support where useful:
 
- automatic language detection
- custom vocabulary
- word-level timestamps
- speaker diarization
- smart transcription/formatting
 
IMPORTANT:
Gemini file-duration limits differ depending on enabled features.
 
Implement chunking based on CURRENT official limits.
 
Do not blindly upload a 2-hour recording as one request.
 
Design quality chunk boundaries with overlap and reconciliation.
 
Do not use 10-second API calls for an entire multi-hour broadcast if that would create hundreds of calls unnecessarily.
 
Prefer sensible multi-minute chunks when the existing recording pipeline can safely provide them.
 
If the current infrastructure only exposes 10-second durable chunks:
create a safe aggregation layer or document/implement an interim path,
rather than pretending the limitation does not exist.
 
============================================================
17. CUSTOM BROADCAST VOCABULARY
============================================================
 
Implement a reusable BroadcastVocabulary service.
 
Build terms from available ECHOO metadata such as:
 
- broadcast/show title
- creator/display name
- station
- guest names
- category/topic
- explicit creator dictionary
- previous confirmed corrections where practical
- manually supplied show terms
 
Normalize:
trim
deduplicate
bound length
remove empty entries
 
Never include arbitrary private database content.
 
Provider mapping:
 
Gemini:
use native custom vocabulary support.
 
Parakeet:
ONLY use an officially supported bias/phrase mechanism if parakeet.js/current model supports it reliably.
 
If Parakeet does not support equivalent native vocabulary:
DO NOT fake it.
 
Instead use a conservative post-recognition replacement/correction layer for explicitly approved terms, while preserving originalText.
 
============================================================
18. TRANSCRIPT DATA INTEGRITY
============================================================
 
Never destructively overwrite the raw transcript.
 
Preserve conceptually:
 
originalText
qualityText/candidate
editedText
publishedText
 
along with existing:
 
provider
providerSegmentId
model
speaker
language
confidence
startMs
endMs
sourceType
sourceLabel
revision
revisionNumber
processedBy
processedAt
qualityHistory
 
Adapt to the actual current schema rather than duplicating properties unnecessarily.
 
Creator edits ALWAYS win over later automated quality processing.
 
Automated providers may suggest/reconcile but must not silently replace creator-approved text.
 
============================================================
19. VALIDATION GATE
============================================================
 
Add a provider-independent transcript quality validation gate.
 
Input:
 
raw/original transcript
quality candidate
 
Checks should be conservative.
 
Examples:
- candidate suddenly empty
- extreme unexplained length change
- obvious unrelated response
- suspicious repetition
- malformed result
- model-answering instead of transcribing
- timestamps moving backward
- impossible segment order
 
Outcome:
 
accepted
rejected with reason
 
If rejected:
 
retain raw transcript.
 
Do not fail the broadcast/replay.
 
Log structured diagnostic reason without logging unnecessary private transcript content.
 
============================================================
20. TRANSCRIPT PERSISTENCE
============================================================
 
Reuse the existing backend persistence pipeline.
 
Canonical path should remain conceptually:
 
provider
  |
  v
normalized ECHOO transcript event
  |
  v
backend
  |
  v
persistTranscriptSegment(...)
  |
  v
TranscriptSegment
  |
  v
Socket.IO
  |
  v
Creator/replay UI
 
Do NOT let Browser Parakeet write MongoDB directly.
 
Use authenticated ECHOO APIs/Socket.IO.
 
Validate:
- broadcast ownership
- active broadcast state
- segment IDs
- sequence
- text length
- time ranges
 
Prevent a malicious listener from submitting creator transcript segments.
 
============================================================
21. FRONTEND -> BACKEND TRANSCRIPT DELIVERY
============================================================
 
Inspect existing transcript Socket.IO/API transport.
 
Reuse it if appropriate.
 
For Browser Parakeet, send normalized segment objects such as:
 
provider
model
providerSegmentId
sequence
text
isFinal
startMs
endMs
confidence
language
sourceType: final_mix
sourceLabel: Echoo final mix
 
Use server-side validation regardless of browser values.
 
Do not trust provider IDs from arbitrary clients without authorization checks.
 
Implement retry/idempotency.
 
A reconnect should not duplicate already persisted final segments.
 
============================================================
22. OFFLINE/NETWORK BEHAVIOR
============================================================
 
Parakeet can continue locally when internet briefly disappears AFTER the model is available.
 
Take advantage of that.
 
If backend connectivity is lost:
 
do not discard finalized local transcript segments immediately.
 
Maintain a bounded pending transcript upload queue.
 
When Socket.IO/API connectivity returns:
retry final segments idempotently.
 
Do NOT build unbounded browser storage.
 
Persist small essential metadata if needed.
 
Broadcast behavior and transcript behavior remain separate.
 
============================================================
