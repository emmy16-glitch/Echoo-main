# Echoo Desktop Studio

The Echoo Desktop Studio is a native desktop wrapper for the Echoo real-time audio broadcasting platform. Built with **Electron**, it provides a more integrated experience for creators, including native window management and improved performance for audio streaming.

## 🚀 Features
- **Native Experience**: Run Echoo as a standalone application outside the browser.
- **Optimized Audio**: Built-in support for WebRTC and LiveKit streaming.
- **Cross-Platform**: Support for Windows, macOS, and Linux.
- **Branded**: Includes official Echoo icons and styling.

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
To launch the desktop app in development mode:
```bash
npm start
```
*Note: Ensure your Echoo web backend and frontend are running (e.g., via `scripts/dev-ngrok.sh`) so the desktop app can connect.*

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
- `build/`: Contains platform-specific icons (`icon.ico`, `icon.icns`).
- `dist/`: The output folder for built executables.

## 🤝 Contributing
For issues or feature requests related to the desktop wrapper, please refer to the main repository documentation.
