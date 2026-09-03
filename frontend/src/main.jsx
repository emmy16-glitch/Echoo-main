import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary from "./Components/System/AppErrorBoundary.jsx";
import BroadcastRecordingPrompt from "./Components/CreatorStudio/BroadcastRecordingPrompt.jsx";
import settingsService from "./services/settingsService.js";
import { initializeEchooTheme } from "./theme/themePreference.js";
import "./accessibility/installPlayerKeyboardAccess.js";
import "./accessibility/installUiSemanticRepairs.js";
import "./index.css";
import "./theme/EchooTheme.css";

import "./styles/echoo-phase13-final.css";
import "./styles/echoo-final-visual-correction.css";
import "./styles/echoo-mock-media.css";
import "./styles/echoo-home-final-fill.css";
import "./styles/echoo-library-media-final.css";
import "./styles/echoo-batch1-integration.css";
import "./styles/station-brand-rendering.css";
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
import "./styles/creator-ui-page-integrity-2026.css";
import "./styles/deep-hidden-audit-fixes.css";
import "./styles/playwright-run4-hardening.css";
import "./styles/playwright-run5-hardening.css";
import "./styles/playwright-run6-root-layout-hardening.css";
import "./styles/playwright-run7-final-gate-fixes.css";
import "./styles/echoo-artwork-fit.css";
import "./Components/Register/auth-reference.css";
import "./Components/Register/figma-auth-login.css";
import "./Components/Register/figma-auth-verification.css";
import "./Components/Register/figma-auth-parity.css";
import "./Components/Register/figma-auth-success.css";
initializeEchooTheme();

// Older builds used this as a persistent transcript-processing selector. It is
// now a one-shot notification concept represented by echooPreparedBroadcastId;
// clear any stale value left in an existing tab/session before the app starts.
try {
  sessionStorage.removeItem("echooProcessingBroadcastId");
} catch {
  // Storage can be unavailable in hardened/private browser contexts.
}

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
