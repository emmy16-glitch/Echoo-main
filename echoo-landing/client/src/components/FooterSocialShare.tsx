import React from "react";
import { buildSocialShareUrl, SOCIAL_SHARE_MESSAGE, type SocialShareTarget } from "@/lib/socialShare";

const releaseUrl = "https://echoo.digi02.org/release";

type SocialControl = {
  platform: SocialShareTarget;
  label: string;
  mark: string;
};

const controls: SocialControl[] = [
  { platform: "x", label: "X", mark: "X" },
  { platform: "linkedin", label: "LinkedIn", mark: "in" },
  { platform: "whatsapp", label: "WhatsApp", mark: "◔" },
];

/** Accessible social links with no Echoo tracking parameters or visitor data. */
export function FooterSocialShare() {
  return (
    <aside className="footer-social-share" aria-label="Share Echoo">
      <p className="text-[.58rem] font-black tracking-[.15em] text-[#BFD2F6]">SHARE THIS RELEASE</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {controls.map(({ platform, label, mark }) => (
          <a
            key={platform}
            href={buildSocialShareUrl(platform, releaseUrl, SOCIAL_SHARE_MESSAGE)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Share Echoo Studio v1.0.5 on ${label}`}
            className={`footer-social-button footer-social-${platform}`}
          >
            <span aria-hidden="true" className="font-black">{mark}</span>
            <span className="sr-only">Share on {label}</span>
          </a>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#7E95BF]">Sharing opens your chosen service with the public release link. Echoo does not collect sharing activity.</p>
    </aside>
  );
}
