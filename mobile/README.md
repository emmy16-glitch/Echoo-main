# Echoo Mobile

Echoo Mobile is the React Native/Expo companion application for Echoo live-audio experiences. It is kept as a separate subproject from `frontend`, `desktop`, and `echoo-landing`.

## Run locally

1. Install dependencies

   ```bash
    npm ci
   ```

2. Start the app

   ```bash
    npm start
   ```

In the Expo output, choose an Android emulator, an Android development build, or Expo Go where the installed native dependencies are supported.

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Build an installable Android APK

The `preview` EAS profile is configured to output a standalone APK for internal testing. Read [APK_BUILD.md](./APK_BUILD.md) for the required account access, validation steps, and build command.

## Key commands

```bash
npm run android
npm run lint
npm run build:android:preview
npm run check:production-env
```

Keep credentials and production endpoint values out of tracked files. The mobile application depends on public HTTPS/WSS endpoints for production device access.
