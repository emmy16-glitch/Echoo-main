# Echoo documentation

> **Hosting/deploying Echoo? Start with [../HOSTING.md](../HOSTING.md).**
> FFmpeg + FFprobe are mandatory for automatic server MP3 recording and
> server-side trimming. Live transcription is optional and currently off by
> default with `TRANSCRIPTION_ENABLED=false`. AI agents must also follow
> [../AGENTS.md](../AGENTS.md).

| Document | What it answers |
|---|---|
| **[Hosting / deployment first-read](../HOSTING.md)** | **Mandatory runtime dependencies, FFmpeg/FFprobe, storage, env, build/restart and acceptance checks.** |
| [AI agent instructions](../AGENTS.md) | Rules an AI/automation agent must follow before hosting or updating Echoo. |
| [Product overview](product.md) | What is Echoo? Who is it for? What can each role do? |
| [Getting started](getting-started.md) | How do I run everything locally? Ports, env, tests. |
| [Architecture](architecture.md) | How do the pieces fit? Who owns what? |
| [Audio pipeline (deep dive)](audio-architecture.md) | How does live audio flow, capture to ear? |
| [Deployment & operations](deployment.md) | Where is it hosted? How do releases work? LiveKit, storage, desktop installers. |
| [Transcription](transcription.md) | How does live transcription deploy and behave? |
| [Hosted-server sync](../HOSTED-SERVER-SYNC.md) | Active task checklist for the hosted server operator. |
| [Archive](archive/) | Frozen point-in-time audits and historical reports. |

Component guides live next to their code:

- Web app: [`frontend/`](../frontend/) (overview below in this index is intentionally brief)
- Desktop app: [`desktop/README.md`](../desktop/README.md)
- Mobile app: [`mobile/README.md`](../mobile/README.md) · builds: [`mobile/APK_BUILD.md`](../mobile/APK_BUILD.md)
- Design system: [`frontend/src/design-system/`](../frontend/src/design-system/)


## Documentation authority

Current operational authority, in order:

1. `../HOSTING.md`
2. `deployment.md`
3. `../backend/.env.example`
4. `audio-architecture.md`
5. `../HOSTED-SERVER-SYNC.md` for the Digi02 production server

`archive/` is historical only. Do not use archived audits as current hosting instructions.
