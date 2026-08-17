import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary from "./Components/System/AppErrorBoundary.jsx";
import "./index.css";
import "./theme/EchooTheme.css";

import "./styles/echoo-phase13-final.css";
import "./styles/echoo-final-visual-correction.css";
import "./styles/echoo-mock-media.css";
import "./styles/echoo-home-final-fill.css";
import "./styles/echoo-library-media-final.css";
import "./styles/echoo-batch1-integration.css";
import "./styles/station-brand-rendering.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);