import React from "react";
import { Download, Headphones, Menu, Mic2, Radio, Sparkles, TerminalSquare, type LucideIcon } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type PublicNavigationLink = {
  href: string;
  label: string;
};

export type PublicNavigationAction = {
  href: string;
  label: string;
};

function navigationIconFor(link: PublicNavigationLink): LucideIcon {
  if (link.href.includes("downloads")) return Download;
  if (link.href.includes("install")) return TerminalSquare;
  if (link.href.includes("studio")) return Mic2;
  if (link.href.includes("experience")) return Headphones;
  if (link.href.includes("changelog")) return Sparkles;
  if (link.href.includes("release")) return Radio;
  return Sparkles;
}

export const MOBILE_PUBLIC_MENU_OVERLAY_CLASS = "mobile-public-menu-overlay bg-[#041A42]/58 backdrop-blur-[2px] data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:backdrop-blur-none";
export const MOBILE_PUBLIC_MENU_PANEL_CLASS = "mobile-public-menu-panel border-[#164F9D]/15 bg-[#F8FBFF] px-5 pb-7 pt-8 text-[#102E63] data-[state=closed]:duration-200 data-[state=open]:duration-300 sm:px-8 dark:bg-[#071736] dark:text-white";

type MobileNavigationLinksProps = {
  action: PublicNavigationAction;
  links: readonly PublicNavigationLink[];
  navigationLabel: string;
};

/** The same close-on-select links used by the compact public drawer menu. */
export function MobileNavigationLinks({
  action,
  links,
  navigationLabel,
}: MobileNavigationLinksProps) {
  return (
    <nav aria-label={`${navigationLabel} menu`} className="mt-7 grid gap-2">
      {links.map(link => (
        (() => {
          const Icon = navigationIconFor(link);
          return (
            <SheetClose asChild key={link.href}>
              <a
                href={link.href}
                className="group flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[0.72rem] font-black tracking-[0.13em] text-[#123F81] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#EAF1FF] hover:text-[#0A326F] focus-visible:bg-[#EAF1FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B78FF] active:translate-y-px active:bg-[#DDEAFF] motion-reduce:transition-none motion-reduce:active:translate-y-0"
              >
                <Icon className="h-4 w-4 shrink-0 text-[#3B78FF] transition-[color,transform] duration-150 ease-out group-hover:scale-110 group-hover:text-[#2466D7] group-focus-visible:scale-110 group-focus-visible:text-[#2466D7] group-active:scale-95 group-active:text-[#164F9D] motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100 motion-reduce:group-active:scale-100" aria-hidden="true" />
                <span>{link.label}</span>
              </a>
            </SheetClose>
          );
        })()
      ))}
      <SheetClose asChild>
        <a
          href={action.href}
          className="group mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#3B78FF] px-5 text-[0.68rem] font-black tracking-[0.12em] text-white shadow-[0_10px_26px_rgba(59,120,255,.3)] transition-[background-color,transform] duration-150 ease-out hover:bg-[#5B8EFF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B78FF] active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <Download className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5 group-active:scale-95 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-focus-visible:translate-x-0 motion-reduce:group-active:scale-100" aria-hidden="true" />
          <span>{action.label}</span>
        </a>
      </SheetClose>
    </nav>
  );
}

/** Compact, keyboard-accessible public navigation for screens below the desktop breakpoint. */
export function MobilePublicMenu({
  action,
  links,
  navigationLabel,
}: MobileNavigationLinksProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="group inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#164F9D]/15 bg-white text-[#123F81] shadow-[0_6px_18px_rgba(22,79,157,.08)] transition-[background-color,border-color,transform] duration-150 ease-out hover:border-[#164F9D]/35 hover:bg-[#EEF5FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B78FF] active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100"
          aria-label={`Open ${navigationLabel.toLowerCase()} menu`}
        >
          <Menu className="h-4 w-4 transition-transform duration-150 ease-out group-hover:rotate-3 group-focus-visible:rotate-3 group-active:scale-95 motion-reduce:transition-none motion-reduce:group-hover:rotate-0 motion-reduce:group-focus-visible:rotate-0 motion-reduce:group-active:scale-100" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="top"
        overlayClassName={MOBILE_PUBLIC_MENU_OVERLAY_CLASS}
        className={MOBILE_PUBLIC_MENU_PANEL_CLASS}
      >
        <SheetHeader className="p-0 pr-10 text-left">
          <SheetTitle className="text-[0.72rem] font-black tracking-[0.16em] text-[#123F81] dark:text-white">
            ECHOO NAVIGATION
          </SheetTitle>
          <SheetDescription className="mt-2 text-sm leading-6 text-[#52709F] dark:text-[#B6C8EC]">
            Explore Echoo or go straight to the current desktop release.
          </SheetDescription>
        </SheetHeader>
        <MobileNavigationLinks action={action} links={links} navigationLabel={navigationLabel} />
      </SheetContent>
    </Sheet>
  );
}
