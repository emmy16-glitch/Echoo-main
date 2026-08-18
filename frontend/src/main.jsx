import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary from "./Components/System/AppErrorBoundary.jsx";
import settingsService from "./services/settingsService.js";
import { initializeEchooTheme } from "./theme/themePreference.js";
import "./index.css";
import "./theme/EchooTheme.css";

import "./styles/echoo-phase13-final.css";
import "./styles/echoo-final-visual-correction.css";
import "./styles/echoo-mock-media.css";
import "./styles/echoo-home-final-fill.css";
import "./styles/echoo-library-media-final.css";
import "./styles/echoo-batch1-integration.css";
import "./styles/station-brand-rendering.css";
import "./styles/listener-premium-polish.css";
import "./styles/listener-final-overrides.css";
import "./styles/listener-reference-pages.css";
import "./styles/listener-reference-pages-extended.css";
import "./styles/listener-shell-unified.css";
import "./styles/listener-reference-final.css";
import "./styles/echoo-experience-2026.css";
import "./styles/echoo-component-refinement-2026.css";
import "./styles/echoo-auth-motion-2026.css";

initializeEchooTheme();

if (localStorage.getItem("accessToken")) {
  settingsService.get().catch(() => {
    // Echoo remains on its intentional product theme if account hydration is unavailable.
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
