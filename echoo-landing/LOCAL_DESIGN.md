# Echoo Landing — Local Design Workflow

Use this workflow to run the landing page locally from **VS Code** and make visual changes without touching the desktop application or production release files.

## One-time setup on Ubuntu

The landing page now lives inside the **Echoo-main** source tree. Open the VS Code terminal and clone the application repository once into your Projects folder:

```bash
mkdir -p ~/Projects
cd ~/Projects
gh repo clone effiukp/Echoo-main Echoo-main
cd Echoo-main/echoo-landing
```

If GitHub CLI is not signed in yet, run `gh auth login` first and choose GitHub.com. After cloning, install dependencies:

```bash
pnpm install
```

If your clone is elsewhere, replace the path with your actual repository folder. The project expects a current Node.js LTS release and `pnpm`; confirm them with `node --version` and `pnpm --version`.

## Run the design preview

For visual work only, run:

```bash
pnpm dev:design
```

Open the local address printed by Vite—normally `http://localhost:5173`—in Chrome or Firefox. Keep the terminal running while you edit. The page refreshes automatically after a saved change.

Use the full application mode only when you need to test the early-access form or server-backed behavior:

```bash
pnpm dev
```

That command starts the complete landing application, normally at `http://localhost:3000`.

| What you want to change | Start here |
|---|---|
| Release-page layout, download copy, spacing, and platform selector | `client/src/pages/Release.tsx` |
| Homepage sections and headline content | `client/src/pages/Home.tsx` |
| Footer newsletter, social sharing, and homepage links | `client/src/pages/Home.tsx` |
| Site-wide typography, colors, and responsive rules | `client/src/index.css` |
| Light/dark preference and transition timing | `client/src/contexts/ThemeContext.tsx` and `client/src/index.css` |
| Theme toggle button | `client/src/components/ThemeToggle.tsx` |
| Compact phone navigation drawer | `client/src/components/MobilePublicMenu.tsx` and `client/src/components/PublicNavShell.tsx` |
| Floating Back to Top button | `client/src/components/BackToTop.tsx` |
| Footer social share destinations | `client/src/lib/socialShare.ts` |
| Release Copy Link behavior and temporary “Copied!” state | `client/src/pages/Release.tsx`, `client/src/lib/releaseShareLink.ts`, and `client/src/lib/releaseCopyFeedback.ts` |
| Collapsible v1.0.5 changelog state | `client/src/pages/Release.tsx` and `client/src/lib/releaseChangelogState.ts` |
| Footer newsletter validation and confirmation copy | `client/src/pages/Home.tsx` and `client/src/lib/newsletterSubscription.ts` |
| Double-opt-in confirmation flow | `server/newsletterDelivery.ts`, `server/routers.ts`, and `client/src/pages/NewsletterConfirmation.tsx` |
| Platform recommendation logic | `client/src/lib/downloadSelector.ts` |
| Anonymous download-event naming | `client/src/lib/releaseDownloadAnalytics.ts` |

## Design review loop

Work in small saved changes, then check both desktop and phone widths in browser DevTools. Use **Toggle device toolbar** and test a narrow 375px viewport as well as a desktop width. Keep interactive targets at least 44px tall, keep blue text readable on white, and preserve the paired-ellipse Echoo logo and blue/white brand palette.

Before sharing a design change, run:

```bash
pnpm test
pnpm check
pnpm build
```

## Safe collaboration boundary

The landing page and the Electron app remain separate **subprojects**. On Ubuntu, edit `~/Projects/Echoo-main/echoo-landing`; do not edit `~/Projects/Echoo-main/desktop` unless you intentionally want to change the desktop application. Installer URLs are configured in `Release.tsx`; do not replace them with private GitHub release links, because public visitors cannot access a private repository.

## Newsletter activation boundary

The consent-backed double-opt-in workflow is present but **inactive by default**. It will not save a pending subscriber or send an email unless `NEWSLETTER_DELIVERY_ENABLED=true` is set together with a valid `RESEND_API_KEY`, verified `RESEND_FROM_EMAIL`, and HTTPS `NEWSLETTER_CONFIRMATION_ORIGIN`. Do not enable the flag until the non-delivery Resend credential test passes.
