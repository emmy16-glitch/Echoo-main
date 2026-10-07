import { useLayoutEffect } from "react";

export default function DesktopAppReady() {
  useLayoutEffect(() => {
    // The packaged window intentionally stays hidden until this signal arrives.
    // Browser frame callbacks are throttled for hidden Chromium windows, which
    // can deadlock startup behind the native readiness watchdog. A layout
    // effect runs as soon as React commits the shell, before any paint is required.
    window.echooDesktop?.appReady?.();
  }, []);

  return null;
}
