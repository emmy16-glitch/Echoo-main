import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary from "./Components/System/AppErrorBoundary.jsx";
import BroadcastRecordingPrompt from "./Components/CreatorStudio/BroadcastRecordingPrompt.jsx";
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
import "./styles/echoo-responsive-2026.css";
import "./styles/echoo-responsive-audit-fix.css";
import "./styles/echoo-tooltips-2026.css";
import "./styles/listener-logout-visibility-fix.css";
import "./styles/echoo-logout-always-visible.css";
import "./styles/echoo-product-ui-2026.css";
import "./styles/echoo-player-cleanup-2026.css";
import "./styles/creator-artwork-layout-2026.css";
import "./Components/CreatorStudio/CreatorAudioCardControls.css";
import "./styles/creator-typography-system.css";
import "./styles/creator-data-pages-typography.css";
import "./styles/creator-studio-consistency-audit.css";
import "./styles/creator-broadcast-studio-final.css";
import "./styles/creator-shell-broadcast-breathing-room.css";
import "./styles/creator-broadcast-responsive-shell-fix.css";
import "./styles/creator-broadcast-guided-mixer.css";
import "./styles/creator-broadcast-strict-audit.css";
import "./styles/creator-audio-interaction-fix.css";
import "./styles/creator-ui-harmony-2026.css";

// Shared design system is loaded after feature layers so Creator and Listener
// resolve the same shell primitives. Integrity layers are deliberately last and
// contain only cross-page/responsive and active-page usability invariants.
import "./theme/EchooDesignSystem.css";
import "./Components/Shared/SharedPrimitives.css";
import "./design-system/design-system.css";
import "./styles/echoo-ui-integrity-audit-2026.css";
import "./styles/echoo-ui-page-integrity-2026.css";
import "./styles/listener-ui-deep-integrity-2026.css";
import "./styles/creator-ui-page-integrity-2026.css";

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
      <BroadcastRecordingPrompt />
    </AppErrorBoundary>
  </React.StrictMode>
);