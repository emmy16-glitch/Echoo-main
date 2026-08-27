export type CuratedHelpMode = "website" | "listener" | "creator";

export type CuratedHelpResponse = {
  topic: string;
  answer: string;
};

const SHARED_PRIVACY_NOTE =
  "This is curated product guidance, not a generative AI service. It does not access account, room, or message data.";

export const CURATED_HELP_SUGGESTIONS: Record<CuratedHelpMode, readonly string[]> = {
  website: [
    "Where can I download Echoo Studio?",
    "Can I use Echoo in my browser?",
    "What is new in v1.0.5?",
  ],
  listener: [
    "How do I find a live room?",
    "Why will audio not play?",
    "Where are my settings?",
  ],
  creator: [
    "Give me a pre-broadcast checklist",
    "Help me describe a new station",
    "What should I check in my audio setup?",
  ],
};

const WEBSITE_FALLBACK =
  "I can help with Echoo’s web experience, verified desktop downloads, release notes, and early access. Try asking where to download Echoo Studio or what is included in v1.0.5.";
const LISTENER_FALLBACK =
  "I can guide you to Echoo listener features, including finding live rooms, playback controls, and settings. I cannot see your account, room, or playback state.";
const CREATOR_FALLBACK =
  "I can offer a curated broadcast checklist, copy templates for a station, audio-readiness tips, and privacy-safe audience guidance. I cannot access your private room, chat, or account data.";

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
  if (includesAny(query, ["download", "installer", "windows", "macos", "mac", "linux", "ubuntu", "debian", "appimage", "deb"])) {
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
  if (includesAny(query, ["live", "room", "station", "find", "discover", "search"])) {
    return response(
      "Finding audio",
      "Use Live to browse current broadcasts, Stations to explore creator pages, and Search to look for public audio and creators. The assistant cannot confirm whether a specific room is live or available to you."
    );
  }

  if (includesAny(query, ["play", "pause", "mute", "unmute", "audio", "sound", "volume", "autoplay", "hear"])) {
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

  if (includesAny(query, ["mixer", "microphone", "mic", "audio", "sound", "level", "headphone", "monitor"])) {
    return response(
      "Audio readiness",
      "Check the selected input device, listen with headphones, set conservative speaking levels that do not clip, and keep the room monitor accessible while live. A short private sound check before inviting an audience is the safest way to verify your setup."
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
    ? "Ask about the web app, downloads, releases, or early access."
    : mode === "listener"
      ? "Ask how to find live audio, use playback controls, or reach settings."
      : "Ask for a broadcast checklist, station-copy template, or audio-readiness reminder.";

  return response(label, prompt);
}
