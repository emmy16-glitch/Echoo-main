export type SocialShareTarget = "x" | "linkedin" | "whatsapp";

export const SOCIAL_SHARE_MESSAGE = "See the Echoo Studio v1.0.5 release.";

export function buildSocialShareUrl(
  target: SocialShareTarget,
  pageUrl: string,
  message = SOCIAL_SHARE_MESSAGE,
) {
  const encodedUrl = encodeURIComponent(pageUrl);
  const encodedMessage = encodeURIComponent(message);

  switch (target) {
    case "x":
      return `https://twitter.com/intent/tweet?text=${encodedMessage}&url=${encodedUrl}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${message} ${pageUrl}`)}`;
  }
}
