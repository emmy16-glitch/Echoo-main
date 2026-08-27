# Echoo Android APK Build

This project’s installable Android package is built from the `preview` profile in `mobile/eas.json`. That profile uses `android.buildType: "apk"`, which produces a directly installable APK for internal testing; it is separate from the web and desktop release workflows.

## Prerequisites

Use Node.js 20 or later and install the locked mobile dependencies from the `mobile` directory.

```bash
cd ~/Projects/Echoo-main/mobile
npm ci
npx eas-cli whoami
```

The standalone Echoo mobile project is configured as `@effiukp-dev/echoo`. The EAS account must be authorized to access that project. Do not add an Expo access token to source control, `app.json`, or any tracked file.

If an inherited project is inaccessible, do not bypass its access controls. For this mobile delivery path, the project owner explicitly approved creating and linking a **new**, Echoo-branded standalone EAS project under `effiukp-dev`; it now uses the `Echoo` name, `echoo` slug, and `org.digi02.echoo` Android application ID. Reassigning an existing shared EAS project still requires the existing owner’s authorization.

## Build a standalone APK

Run the existing preview profile:

```bash
npm run build:android:preview
```

EAS prints a build URL. When the build completes, download the APK from that authenticated build page, transfer it only through a trusted channel, and install it on an Android test device after reviewing Android’s installation warning. The preview profile is intended for direct tester installation, not Play Store submission. A completed Echoo-branded preview APK is an internal distribution artifact with Android package ID `org.digi02.echoo`; its EAS build page records the authoritative current artifact link and expiration date.

## Production checks

The production profile validates public HTTPS API and Socket URLs plus a public `wss:`/`https:` LiveKit URL before building. Set those values only through the configured EAS environment or a local untracked environment file, then run:

```bash
npm run check:production-env
npm run build:android:production
```

Production build configuration must be reviewed before release because it may produce a Play Store-oriented artifact rather than the directly installable preview APK.

## Support-data boundary

The current application uses only the consented, recipient-free email-draft escalation control. It does **not** submit or store support requests. If a verified Echoo team inbox is enabled later, support requests require explicit submission consent, a maximum 10-day retention period, a deletion-request path, and review by the existing `support-admin`/admin before any recurring issue becomes a curated-help topic. Topic updates remain deterministic and approval-only; no user feedback may be automatically published or sent to an external AI service.
