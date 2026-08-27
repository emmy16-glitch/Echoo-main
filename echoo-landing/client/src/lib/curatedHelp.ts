export type CuratedHelpMode = "website" | "listener" | "creator";

export type CuratedHelpResponse = {
  topic: string;
  answer: string;
};

const SHARED_PRIVACY_NOTE =
  "This is curated product guidance, not a generative AI service. It does not access account, room, or message data.";

/**
 * This draft intentionally has no recipient, body, account detail, or user question.
 * After explicit consent, the visitor chooses a verified Echoo support recipient and
 * decides whether to send anything from their own mail client.
 */
export const HUMAN_SUPPORT_EMAIL_DRAFT = "mailto:?subject=Echoo%20human%20support%20request";

export const CURATED_HELP_SUGGESTIONS: Record<CuratedHelpMode, readonly string[]> = {
  website: [
    "Where can I download Echoo Studio?",
    "Can I use Echoo in my browser?",
    "Why does my installer show a security warning?",
    "The website or sign-in page is not loading",
  ],
  listener: [
    "How do I find a live room?",
    "Why will audio not play?",
    "The player keeps loading or reconnecting",
    "Where are my settings?",
  ],
  creator: [
    "Give me a pre-broadcast checklist",
    "What should I check in my audio setup?",
    "My microphone permission is blocked",
    "Help me describe a new station",
  ],
};

const WEBSITE_FALLBACK =
  "I can help with Echoo’s web experience, verified desktop downloads, release notes, installer troubleshooting, and early access. Try asking where to download Echoo Studio or why a browser page will not load.";
const LISTENER_FALLBACK =
  "I can guide you to Echoo listener features, including finding live rooms, playback controls, connection troubleshooting, and settings. I cannot see your account, room, or playback state.";
const CREATOR_FALLBACK =
  "I can offer a curated broadcast checklist, copy templates for a station, audio-readiness and permission tips, connection troubleshooting, and privacy-safe audience guidance. I cannot access your private room, chat, or account data.";

function normalise(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(query: string, terms: readonly string[]) {
  return terms.some((term) => query.includes(term));
}

function response(topic: string, answer: string): CuratedHelpResponse {
  return { topic, answer: `${answer} ${SHARED_PRIVACY_NOTE}` };
}

function resolveWebsiteHelp(query: string): CuratedHelpResponse {
  if (includesAny(query, ["smart screen", "smartscreen", "gatekeeper", "security warning", "blocked", "unsigned", "notarized"])) {
    return response(
      "Installer warnings",
      "Current v1.0.5 desktop installers are explicitly unsigned. Windows SmartScreen or macOS Gatekeeper can show a warning, and the macOS DMG is not notarized. Download only from Echoo’s official Release page, confirm that you selected the intended operating-system file, and do not enter a password or disable system protection for an unfamiliar download."
    );
  }

  if (includesAny(query, ["download", "installer", "windows", "macos", "mac", "linux", "ubuntu", "debian", "appimage", "deb", "tar gz"])) {
    return response(
      "Downloads",
      "Open the Release page to choose a verified Echoo Studio file. It lists a Windows Setup .exe, Apple-silicon macOS .dmg, Ubuntu/Debian .deb, AppImage, and Linux tar.gz. Current v1.0.5 installers are unsigned, so Windows SmartScreen or macOS Gatekeeper may present a warning; the macOS DMG is not notarized."
    );
  }

  if (includesAny(query, ["browser", "web app", "online", "web version", "listen online"])) {
    return response(
      "Web app",
      "Use the live Echoo web app at echoo.digi02.org to sign in, listen, or create. The public website and the web app have separate purposes: the public site explains the product and releases, while the app hosts the authenticated listening and creator workspaces."
    );
  }

  if (includesAny(query, ["sign in", "signin", "log in", "login", "access", "password", "not loading", "blank", "error", "broken", "refresh", "cache"])) {
    return response(
      "Web troubleshooting",
      "First, check your connection and refresh the page. If the issue continues, try an up-to-date browser, temporarily close duplicate Echoo tabs, and retry the live app at echoo.digi02.org. This assistant cannot inspect sign-in status or reset credentials, so do not share passwords, codes, or account details here."
    );
  }

  if (includesAny(query, ["release", "version", "v1 0 5", "changelog", "what is new", "new in"])) {
    return response(
      "Release notes",
      "Echoo Studio v1.0.5 focuses on clearer listener playback controls, privacy-preserving desktop alerts, and verified public download guidance for Windows, macOS, and Linux. The Release page includes the detailed changelog."
    );
  }

  if (includesAny(query, ["early access", "newsletter", "email", "updates", "signup", "sign up"])) {
    return response(
      "Early access",
      "You can use the early-access form on the homepage to request product updates and invitations. The form asks for consent before any email delivery. Newsletter delivery remains safely inactive until Echoo finishes verified sender configuration."
    );
  }

  return response("Product guidance", WEBSITE_FALLBACK);
}

function resolveListenerHelp(query: string): CuratedHelpResponse {
  if (includesAny(query, ["loading", "reconnect", "reconnecting", "buffer", "spinning", "disconnect", "connection", "network"])) {
    return response(
      "Connection troubleshooting",
      "If a room keeps loading or reconnecting, check your internet connection, keep the Echoo tab open, and refresh the room once the connection is stable. If you are on a restrictive work, school, or public network, try another trusted connection. The assistant cannot inspect the room’s live connection state."
    );
  }

  if (includesAny(query, ["live", "room", "station", "find", "discover", "search", "browse"])) {
    return response(
      "Finding audio",
      "Use Live to browse current broadcasts, Stations to explore creator pages, and Search to look for public audio and creators. The assistant cannot confirm whether a specific room is live or available to you."
    );
  }

  if (includesAny(query, ["play", "pause", "mute", "unmute", "audio", "sound", "volume", "autoplay", "hear", "speaker", "output", "permission"])) {
    return response(
      "Playback",
      "Use the persistent player at the bottom of the listener workspace for play, pause, seeking, mute, and volume. If a browser will not start audio, interact with the page once, check your device output and browser site permissions, then try play again."
    );
  }

  if (includesAny(query, ["setting", "profile", "account", "notification", "preferences"])) {
    return response(
      "Settings",
      "Open Settings from the listener sidebar or account menu to review your profile and listener preferences. For notifications, use the dedicated Notifications area. This assistant cannot view or change your settings."
    );
  }

  return response("Listener support", LISTENER_FALLBACK);
}

function resolveCreatorHelp(query: string): CuratedHelpResponse {
  if (includesAny(query, ["permission", "allow microphone", "deny microphone", "blocked microphone", "browser permission"])) {
    return response(
      "Microphone permissions",
      "Use your browser’s site-permission controls to allow Echoo to use the selected microphone, then return to the studio and choose the intended input. If the wrong device is selected, reconnect it and repeat a short private sound check before inviting listeners. The copilot cannot see device permissions or change them for you."
    );
  }

  if (includesAny(query, ["connection", "reconnect", "reconnecting", "disconnect", "loading", "cannot go live", "cant go live", "room error"])) {
    return response(
      "Studio connection",
      "If the studio cannot stay connected, check your network, keep the studio tab open, and refresh only when it is safe to restart your setup. Reconfirm microphone and monitoring after reconnecting. The copilot cannot verify whether a room is currently live or change broadcast state."
    );
  }

  if (includesAny(query, ["broadcast", "go live", "live room", "checklist", "prepare", "prep"])) {
    return response(
      "Broadcast checklist",
      "Before going live: confirm your microphone input and monitoring device, make a short room title and description, set your intended visibility, run a brief level check, then prepare the invite path for your audience. Keep a fallback plan if a listener needs help joining."
    );
  }

  if (includesAny(query, ["title", "description", "station", "name", "wording", "copy", "write"])) {
    return response(
      "Station copy",
      "Use a clear title in the format “topic — audience” and a short description that explains the format, cadence, and what people can expect. For example: “Quiet Drafts — a weekly listening room for unfinished ideas.” Avoid implying guarantees or collecting personal details in public room copy."
    );
  }

  if (includesAny(query, ["mixer", "microphone", "mic", "audio", "sound", "level", "headphone", "monitor", "echo", "feedback"])) {
    return response(
      "Audio readiness",
      "Check the selected input device, listen with headphones, set conservative speaking levels that do not clip, and keep the room monitor accessible while live. If you hear echo or feedback, lower speaker output and use headphones before inviting an audience. A short private sound check is the safest way to verify your setup."
    );
  }

  if (includesAny(query, ["invite", "audience", "notification", "privacy", "guest", "chat", "private"])) {
    return response(
      "Audience and privacy",
      "Invite people through the room’s intended sharing flow and use only the notification controls you have deliberately enabled. Do not include private room details in public posts. This copilot cannot read private rooms, chats, audience lists, or account data."
    );
  }

  return response("Creator copilot", CREATOR_FALLBACK);
}

/**
 * Resolves a local, deterministic answer. This module has no API client,
 * persistence, analytics, or access to user/room state by design.
 */
export function resolveCuratedHelpResponse(
  input: string,
  mode: CuratedHelpMode
): CuratedHelpResponse {
  const query = normalise(input);

  if (mode === "listener") return resolveListenerHelp(query);
  if (mode === "creator") return resolveCreatorHelp(query);
  return resolveWebsiteHelp(query);
}

export function getCuratedHelpWelcome(mode: CuratedHelpMode): CuratedHelpResponse {
  const label = mode === "website" ? "Echoo help" : mode === "listener" ? "Listener support" : "Creator copilot";
  const prompt = mode === "website"
    ? "Ask about the web app, downloads, releases, installer warnings, or access troubleshooting."
    : mode === "listener"
      ? "Ask how to find live audio, use playback controls, troubleshoot a connection, or reach settings."
      : "Ask for a broadcast checklist, station-copy template, microphone-permission, connection, or audio-readiness reminder.";

  return response(label, prompt);
}
