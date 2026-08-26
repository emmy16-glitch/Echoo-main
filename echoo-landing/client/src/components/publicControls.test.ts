import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { buildSocialShareUrl, SOCIAL_SHARE_MESSAGE } from "@/lib/socialShare";
import { FooterSocialShare } from "./FooterSocialShare";
import { MobileNavigationLinks, MobilePublicMenu } from "./MobilePublicMenu";
import { PublicNavShell } from "./PublicNavShell";
import { Sheet } from "./ui/sheet";

describe("public navigation and sharing controls", () => {
  it("renders a sticky navigation landmark while preserving a theme-toggle slot", () => {
    const html = renderToStaticMarkup(createElement(
      ThemeProvider,
      null,
      createElement(PublicNavShell, null, createElement(ThemeToggle)),
    ));

    expect(html).toContain('data-public-navigation="sticky"');
    expect(html).toContain('class="public-navigation sticky top-0');
    expect(html).toMatch(/aria-label="Switch to (light|dark) theme"/);
  });

  it("renders labelled, hardened external social links with fixed public release destinations", () => {
    const html = renderToStaticMarkup(createElement(FooterSocialShare));

    expect(html).toContain('aria-label="Share Echoo"');
    expect(html).toContain('aria-label="Share Echoo Studio v1.0.5 on X"');
    expect(html).toContain('aria-label="Share Echoo Studio v1.0.5 on LinkedIn"');
    expect(html).toContain('aria-label="Share Echoo Studio v1.0.5 on WhatsApp"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    for (const platform of ["x", "linkedin", "whatsapp"] as const) {
      expect(html).toContain(buildSocialShareUrl(platform, "https://echoo.digi02.org/release", SOCIAL_SHARE_MESSAGE).replaceAll("&", "&amp;"));
      expect(html).toContain(`footer-social-${platform}`);
    }
    expect(html).not.toContain("utm_");
  });

  it("renders a labelled compact navigation trigger and close-on-select menu routes", () => {
    const links = [
      { href: "#experience", label: "EXPERIENCE" },
      { href: "/release", label: "DOWNLOADS" },
    ] as const;
    const action = { href: "/release#downloads", label: "GET ECHOO" };
    const triggerHtml = renderToStaticMarkup(createElement(
      MobilePublicMenu,
      { action, links, navigationLabel: "Main navigation" },
    ));
    const linksHtml = renderToStaticMarkup(createElement(
      Sheet,
      null,
      createElement(MobileNavigationLinks, { action, links, navigationLabel: "Main navigation" }),
    ));

    expect(triggerHtml).toContain('aria-label="Open main navigation menu"');
    expect(triggerHtml).toContain('min-h-11 min-w-11');
    expect(linksHtml).toContain('aria-label="Main navigation menu"');
    expect(linksHtml).toContain('href="#experience"');
    expect(linksHtml).toContain('href="/release"');
    expect(linksHtml).toContain('href="/release#downloads"');
    expect(linksHtml).toContain("GET ECHOO");
    expect(linksHtml).toContain("min-h-12");
  });
});
