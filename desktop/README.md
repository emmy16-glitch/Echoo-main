# Echoo for Windows

`desktop/` is the one canonical Echoo Windows desktop application. It packages
the real React client locally and connects to the shared Echoo production API
and LiveKit services. It does not load the Echoo website as its application UI
and does not ship MongoDB, Node.js, backend secrets, or a private per-user
production server.

Read [docs/feature-parity-audit.md](docs/feature-parity-audit.md) for the
verified baseline and [docs/architecture.md](docs/architecture.md) for runtime
boundaries and security invariants.

## Requirements

- Windows 10/11 x64
- Node.js 22 or newer for development/building only
- Locked dependencies installed in both `frontend/` and `desktop/`

```powershell
npm ci --prefix frontend
npm ci --prefix desktop
```

End users do not need Node.js, npm, Git, MongoDB, or an `.env` file.

## Development

Run the normal backend and Vite development services, then start Electron:

```powershell
npm run dev --prefix frontend
npm run dev --prefix desktop
```

Development uses the Vite URL. Normal packaged production always uses the
bundled renderer.

## Build the Windows renderer

```powershell
npm run build:renderer --prefix desktop
npm run verify:bundle --prefix desktop
```

The build helper sets public desktop values only:

- `VITE_API_URL=https://echoo.digi02.org/api`
- `VITE_PUBLIC_APP_ORIGIN=https://echoo.digi02.org`
- `VITE_BUILD_BASE=./`

For a different approved deployment, set `ECHOO_DESKTOP_API_URL` and
`ECHOO_DESKTOP_PUBLIC_ORIGIN`. The API URL must be HTTPS. Never pass LiveKit
API secrets, JWT secrets, database credentials, storage secrets, or signing
credentials to the renderer build.

## Test

```powershell
npm test --prefix desktop
```

## Build the NSIS installer

```powershell
npm run dist:win --prefix desktop -- --publish never
```

Expected unsigned artifact:

```text
desktop/dist/Echoo-Setup-2.0.1-x64.exe
```

Electron Builder uses `CSC_LINK` and `CSC_KEY_PASSWORD` when Authenticode
credentials are available securely. Without them the installer is unsigned and
Windows SmartScreen may show **Unknown publisher**.

## Production service dependency

Desktop uses the same backend recording architecture as Echoo Web. Before a
release that changes or deploys the backend, follow the repository-level
`HOSTING.md` checks, including FFmpeg, FFprobe, LiveKit Egress, persistent
recording storage, `/api/health`, and `/api/health/recording`.
