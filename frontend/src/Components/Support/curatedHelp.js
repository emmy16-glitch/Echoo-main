export const humanSupportEmailDraft = 'mailto:?subject=Echoo%20human%20support%20request';

export const curatedHelpSuggestions = {
  listener: [
    'What’s live now?',
    'Find technology stations',
    'Show stations I follow',
    'Help with playback',
  ],
  creator: [
    'Give me a pre-broadcast checklist',
    'What should I check in my audio setup?',
    'My microphone permission is blocked',
    'Help me describe a new station',
  ],
};

const privacyBoundary =
  'This is curated product guidance, not a generative AI service. It does not access private account, room, chat, or playback data.';

const listenerFallback =
  'I can guide you around Echoo listener features, including live rooms, station discovery, playback controls, following, history, connection troubleshooting, and settings. I cannot inspect private account or playback state.';
const creatorFallback =
  'I can offer a curated broadcast checklist, station-copy templates, audio-readiness and permission tips, connection troubleshooting, and privacy-safe audience guidance. I cannot access your private room, chat, audience, or account data.';

const normalise = (input = '') => input
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const includesAny = (query, terms) => terms.some((term) => query.includes(term));

const response = (topic, answer) => ({ topic, answer: `${answer} ${privacyBoundary}` });

const listenerHelp = (query) => {
  if (includesAny(query, ['loading', 'reconnect', 'reconnecting', 'buffer', 'spinning', 'disconnect', 'connection', 'network'])) {
    return response(
      'Connection troubleshooting',
      'If a room keeps loading or reconnecting, check your internet connection, keep the Echoo tab open, and refresh the room once the connection is stable. If you are on a restrictive work, school, or public network, try another trusted connection.'
    );
  }

  if (includesAny(query, ['follow', 'following'])) {
    return response(
      'Following stations',
      'Use the Follow control on public station cards and station profiles. Your followed stations are collected in Following so you can return to them quickly and see what they publish or broadcast next.'
    );
  }

  if (includesAny(query, ['history', 'recent', 'continue', 'resume', 'left off'])) {
    return response(
      'Listening history',
      'Open History to return to recently played audio. When Echoo has saved progress for a replay, Continue listening can take you back to that item without treating an unrelated station as your current playback.'
    );
  }

  if (includesAny(query, ['live', 'room', 'station', 'find', 'discover', 'search', 'browse', 'technology', 'business', 'music', 'sports'])) {
    return response(
      'Finding audio',
      'Use Live now to browse current broadcasts, Stations to explore public creator pages, and Search when you already know a topic, station, or creator you want to find.'
    );
  }

  if (includesAny(query, ['play', 'pause', 'mute', 'unmute', 'audio', 'sound', 'volume', 'autoplay', 'hear', 'speaker', 'output', 'permission'])) {
    return response(
      'Playback',
      'Use the persistent player at the bottom of the listener workspace for play, pause, seeking, mute, and volume. If a browser will not start audio, interact with the page once, check your device output and browser site permissions, then try Play again.'
    );
  }

  if (includesAny(query, ['setting', 'profile', 'account', 'notification', 'preferences'])) {
    return response(
      'Settings',
      'Open Settings from the listener sidebar or account menu to review your profile and listener preferences. For notifications, use the dedicated Notifications area.'
    );
  }

  return response('Echoo Copilot', listenerFallback);
};

const creatorHelp = (query) => {
  if (includesAny(query, ['permission', 'allow microphone', 'deny microphone', 'blocked microphone', 'browser permission'])) {
    return response(
      'Microphone permissions',
      'Use your browser’s site-permission controls to allow Echoo to use the selected microphone, then return to the studio and choose the intended input. If the wrong device is selected, reconnect it and repeat a short private sound check before inviting listeners.'
    );
  }

  if (includesAny(query, ['connection', 'reconnect', 'reconnecting', 'disconnect', 'loading', 'cannot go live', 'cant go live', 'room error'])) {
    return response(
      'Studio connection',
      'If the studio cannot stay connected, check your network, keep the studio tab open, and refresh only when it is safe to restart your setup. Reconfirm microphone and monitoring after reconnecting.'
    );
  }

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

  if (includesAny(query, ['mixer', 'microphone', 'mic', 'audio', 'sound', 'level', 'headphone', 'monitor', 'echo', 'feedback'])) {
    return response(
      'Audio readiness',
      'Check the selected input device, listen with headphones, set conservative speaking levels that do not clip, and keep the room monitor accessible while live. If you hear echo or feedback, lower speaker output and use headphones before inviting an audience. A short private sound check is the safest way to verify your setup.'
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
  'Echoo Copilot',
  mode === 'creator'
    ? 'Ask for a broadcast checklist, station-copy template, microphone-permission, connection, or audio-readiness reminder.'
    : 'Ask how to find live audio, discover stations, use playback controls, follow creators, return to listening history, troubleshoot a connection, or reach settings.'
);
