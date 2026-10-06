import { useEffect } from "react";

export default function DesktopAppReady() {
  useEffect(() => {
    window.echooDesktop?.appReady?.();
  }, []);

  return null;
}
