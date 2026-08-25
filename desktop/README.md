# Echoo Desktop Studio

## Linux installation

The **`.deb` file is an installer package, not a directly runnable program**. After downloading the current `Echoo-Studio-<version>-amd64.deb` asset, install it with your distribution’s software installer or run:

```bash
cd ~/Downloads
sudo apt install ./Echoo-Studio-<version>-amd64.deb
```

Then open **Echoo Studio** from the application launcher, or run `echoo-studio` from a terminal. Do **not** use `chmod +x` or try to run the `.deb` file directly.

For distributions that do not use Debian packages, download the AppImage instead and run:

```bash
chmod +x Echoo-Studio-<version>-x86_64.AppImage
./Echoo-Studio-<version>-x86_64.AppImage
```

Maintainers can create the Linux distribution assets with `npm run build:linux`. This produces a `.deb` installer, an AppImage, and a compressed tarball in `desktop/dist/`.

Echoo Desktop Studio is the secure native shell for the live Echoo audio platform. Built with **Electron**, it loads the production application at [echoo.digi02.org](https://echoo.digi02.org) by default while retaining the product’s web design language, WebRTC capabilities, and creator/listener workflows.

## 🚀 Features
- **Live by default**: Opens the production Echoo application without requiring a local frontend server.
- **Secure shell**: Keeps Node APIs isolated from web content and only exposes a minimal native bridge.
- **Resilient experience**: Shows a branded recovery view if the live service cannot be reached.
- **Native controls**: Provides standard platform menus, zoom/full-screen support, and safe external-link handling.
- **Cross-platform packaging**: Builds NSIS for Windows, DMG for macOS, and AppImage, DEB, Snap, and directory targets for Linux.

---

## 🛠 Installation & Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)

### Setup
1. Navigate to the desktop directory:
   ```bash
   cd desktop
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running in Development
To launch the desktop app against the live Echoo experience:
```bash
npm start
```

For local frontend development, point the shell at your Vite server explicitly:
```bash
NODE_ENV=development ECHOO_URL=http://localhost:5174 npm run dev
```

The desktop shell intentionally loads the website; it is not an offline broadcaster. A working internet connection is required for authentication and live audio rooms.

### Desktop validation

Run the native-shell smoke test before packaging:
```bash
npm test
```

The test starts Electron against a controlled local fixture and confirms that the secure bridge is available while Node remains unavailable to web content.

---

## 📦 Building the Executables

You can generate production-ready installers for your specific operating system.

### Windows (.exe)
Generates a standalone NSIS installer:
```bash
npm run build -- --win
```

### macOS (.dmg)
Generates a Disk Image (requires a Mac for final signing/packaging):
```bash
npm run build -- --mac
```

### Linux (.AppImage)
Generates a universal Linux executable:
```bash
npm run build -- --linux
```

---

## 📂 Project Structure
- `main.js`: The Electron main process (handles window management).
- `preload.js`: The security bridge between native features and the web app.
- `build/`: Contains platform-specific icons (`icon.ico`, `icon.icns`, and Linux PNG assets).
- `offline.html`: Branded recovery page shown when Echoo cannot be reached.
- `test-audio-controls.mjs`: Electron shell and secure-bridge smoke test.
- `dist/`: The output folder for built executables.

## 🤝 Contributing
For issues or feature requests related to the desktop wrapper, please refer to the main repository documentation.
