import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { shouldShowBackToTop } from "@/lib/backToTop";

export function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setIsVisible(shouldShowBackToTop(window.scrollY));
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!isVisible) return null;

  const returnToTop = () => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  return (
    <button type="button" onClick={returnToTop} className="back-to-top" aria-label="Back to top">
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">TOP</span>
    </button>
  );
}
