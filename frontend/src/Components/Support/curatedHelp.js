export const curatedHelpSuggestions = {
  listener: [
    'How do I find a live room?',
    'Why will audio not play?',
    'Where are my settings?',
  ],
  creator: [
    'Give me a pre-broadcast checklist',
    'Help me describe a new station',
    'What should I check in my audio setup?',
  ],
};

const privacyBoundary =
  'This is curated product guidance, not a generative AI service. It does not access account, room, chat, or playback data.';

const listenerFallback =
  'I can guide you to Echoo listener features, including finding live rooms, playback controls, and settings. I cannot see your account, room, or playback state.';
const creatorFallback =
  'I can offer a curated broadcast checklist, station-copy templates, audio-readiness tips, and privacy-safe audience guidance. I cannot access your private room, chat, audience, or account data.';

const normalise = (input = '') => input
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const includesAny = (query, terms) => terms.some((term) => query.includes(term));

const response = (topic, answer) => ({ topic, answer: `${answer} ${privacyBoundary}` });

const listenerHelp = (query) => {
  if (includesAny(query, ['live', 'room', 'station', 'find', 'discover', 'search'])) {
    return response(
      'Finding audio',
      'Use Live to browse current broadcasts, Stations to explore creator pages, and Search to look for public audio and creators. The assistant cannot confirm whether a specific room is live or available to you.'
    );
  }

  if (includesAny(query, ['play', 'pause', 'mute', 'unmute', 'audio', 'sound', 'volume', 'autoplay', 'hear'])) {
    return response(
      'Playback',
      'Use the persistent player at the bottom of the listener workspace for play, pause, seeking, mute, and volume. If a browser will not start audio, interact with the page once, check your device output and browser site permissions, then try play again.'
    );
  }

  if (includesAny(query, ['setting', 'profile', 'account', 'notification', 'preferences'])) {
    return response(
      'Settings',
      'Open Settings from the listener sidebar or account menu to review your profile and listener preferences. For notifications, use the dedicated Notifications area. This assistant cannot view or change your settings.'
    );
  }

  return response('Listener support', listenerFallback);
};

const creatorHelp = (query) => {
  if (includesAny(query, ['broadcast', 'go live', 'live room', 'checklist', 'prepare', 'prep'])) {
    return response(
      'Broadcast checklist',
      'Before going live: confirm your microphone input and monitoring device, make a short room title and description, set your intended visibility, run a brief level check, then prepare the invite path for your audience. Keep a fallback plan if a listener needs help joining.'
    );
  }

  if (includesAny(query, ['title', 'description', 'station', 'name', 'wording', 'copy', 'write'])) {
    return response(
      'Station copy',
      'Use a clear title in the format “topic — audience” and a short description that explains the format, cadence, and what people can expect. For example: “Quiet Drafts — a weekly listening room for unfinished ideas.” Avoid implying guarantees or collecting personal details in public room copy.'
    );
  }

  if (includesAny(query, ['mixer', 'microphone', 'mic', 'audio', 'sound', 'level', 'headphone', 'monitor'])) {
    return response(
      'Audio readiness',
      'Check the selected input device, listen with headphones, set conservative speaking levels that do not clip, and keep the room monitor accessible while live. A short private sound check before inviting an audience is the safest way to verify your setup.'
    );
  }

  if (includesAny(query, ['invite', 'audience', 'notification', 'privacy', 'guest', 'chat', 'private'])) {
    return response(
      'Audience and privacy',
      'Invite people through the room’s intended sharing flow and use only the notification controls you have deliberately enabled. Do not include private room details in public posts. This copilot cannot read private rooms, chats, audience lists, or account data.'
    );
  }

  return response('Creator copilot', creatorFallback);
};

/**
 * Local deterministic help only. There is intentionally no API client,
 * network request, message persistence, analytics event, or access to user data.
 */
export const resolveCuratedHelpResponse = (input, mode) => (
  mode === 'creator' ? creatorHelp(normalise(input)) : listenerHelp(normalise(input))
);

export const getCuratedHelpWelcome = (mode) => response(
  mode === 'creator' ? 'Creator copilot' : 'Listener support',
  mode === 'creator'
    ? 'Ask for a broadcast checklist, station-copy template, or audio-readiness reminder.'
    : 'Ask how to find live audio, use playback controls, or reach settings.'
);
