import React, { type PropsWithChildren } from "react";

/** Shared sticky shell for the public homepage and release navigation. */
export function PublicNavShell({ children }: PropsWithChildren) {
  return (
    <header
      className="public-navigation sticky top-0 z-40 border-b border-[#164F9D]/15 bg-white/90 shadow-[0_8px_28px_rgba(22,79,157,.08)] backdrop-blur-xl"
      data-public-navigation="sticky"
    >
      {children}
    </header>
  );
}
