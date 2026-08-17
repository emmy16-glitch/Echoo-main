import { MOCK_MEDIA, getMockMediaForKey } from "./mockMediaService.js";

const CREATOR_FOLLOW_KEY = "echooMockFollowingCreators";
const STATION_FOLLOW_KEY = "echooMockFollowingStations";
const CHAT_KEY = "echooMockLiveChats";
const REACTION_KEY = "echooMockChatReactions";
const NOTIFICATION_KEY = "echooMockNotifications";

const readJSON = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);

    if (!value) {
      return fallback;
    }

    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const writeJSON = (key, value) => {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );
  } catch {
    return;
  }
};

const createTrack = ({
  id,
  title,
  subtitle,
  genre,
  fileUrl,
  coverArt,
}) => ({
  id,
  title,
  subtitle,
  genre,
  fileUrl,
  duration: 0,

  coverArt:
    coverArt ||
    getMockMediaForKey(
      id ||
        title,
      "audio"
    ),

  coverClass: "motivation-cover",
});

export const mockCreators = [
  {
    id: "pastor-daniel",
    name: "Pastor Daniel",
    initials: "PD",
    handle: "@pastordaniel",
    category: "Faith & Spirituality",
    followers: 12400,
    audioCount: 38,
    replayCount: 16,
    stationId: "faith-talk-radio",
    bio:
      "Faith conversations, Bible teaching and practical encouragement for everyday life.",
    latestAudio: [
      createTrack({
        id: "daniel-audio-1",
        title: "Walking By Faith",
        subtitle: "Pastor Daniel",
        genre: "Spiritual",
        fileUrl: "/audio/sunday-message.mp3",
      }),
      createTrack({
        id: "daniel-audio-2",
        title: "Strength For Today",
        subtitle: "Pastor Daniel",
        genre: "Spiritual",
        fileUrl: "/audio/motivation.mp3",
      }),
      createTrack({
        id: "daniel-audio-3",
        title: "The Power of Hope",
        subtitle: "Pastor Daniel",
        genre: "Podcast",
        fileUrl: "/audio/deep-focus.mp3",
      }),
    ],
    replays: [
      createTrack({
        id: "daniel-replay-1",
        title: "Faith Talk Replay",
        subtitle: "Faith Talk",
        genre: "Spiritual",
        fileUrl: "/audio/sunday-message.mp3",
      }),
      createTrack({
        id: "daniel-replay-2",
        title: "Sunday Conversation",
        subtitle: "Pastor Daniel",
        genre: "Podcast",
        fileUrl: "/audio/motivation.mp3",
      }),
    ],
    upcoming: [
      {
        id: "daniel-upcoming-1",
        title: "Faith Talk Live",
        day: "Friday",
        time: "7:00 PM",
      },
      {
        id: "daniel-upcoming-2",
        title: "Questions of Faith",
        day: "Sunday",
        time: "6:00 PM",
      },
    ],
  },

  {
    id: "james-worship",
    name: "James",
    initials: "JA",
    handle: "@jamesworship",
    category: "Music",
    followers: 8900,
    audioCount: 24,
    replayCount: 12,
    stationId: "praise-worship-radio",
    bio:
      "Live worship, praise sessions and uplifting music for listeners everywhere.",
    latestAudio: [
      createTrack({
        id: "james-audio-1",
        title: "Morning Worship",
        subtitle: "James",
        genre: "Spiritual",
        fileUrl: "/audio/sunday-message.mp3",
      }),
      createTrack({
        id: "james-audio-2",
        title: "Songs of Praise",
        subtitle: "James",
        genre: "Music",
        fileUrl: "/audio/motivation.mp3",
      }),
      createTrack({
        id: "james-audio-3",
        title: "Quiet Worship",
        subtitle: "James",
        genre: "Music",
        fileUrl: "/audio/deep-focus.mp3",
      }),
    ],
    replays: [
      createTrack({
        id: "james-replay-1",
        title: "Praise & Worship Replay",
        subtitle: "James",
        genre: "Music",
        fileUrl: "/audio/sunday-message.mp3",
      }),
      createTrack({
        id: "james-replay-2",
        title: "Evening Worship",
        subtitle: "James",
        genre: "Music",
        fileUrl: "/audio/motivation.mp3",
      }),
    ],
    upcoming: [
      {
        id: "james-upcoming-1",
        title: "Praise & Worship Live",
        day: "Saturday",
        time: "5:00 PM",
      },
      {
        id: "james-upcoming-2",
        title: "Sunday Worship",
        day: "Sunday",
        time: "8:00 AM",
      },
    ],
  },

  {
    id: "echoo-news-team",
    name: "Echoo News",
    initials: "EN",
    handle: "@echoonews",
    category: "News & Politics",
    followers: 6200,
    audioCount: 45,
    replayCount: 28,
    stationId: "echoo-news-radio",
    bio:
      "Short audio updates covering important stories, technology, business and current affairs.",
    latestAudio: [
      createTrack({
        id: "news-audio-1",
        title: "Morning News Brief",
        subtitle: "Echoo News",
        genre: "Podcast",
        fileUrl: "/audio/motivation.mp3",
      }),
      createTrack({
        id: "news-audio-2",
        title: "Technology Update",
        subtitle: "Echoo News",
        genre: "Podcast",
        fileUrl: "/audio/deep-focus.mp3",
      }),
    ],
    replays: [
      createTrack({
        id: "news-replay-1",
        title: "News Update Replay",
        subtitle: "Echoo News",
        genre: "Podcast",
        fileUrl: "/audio/motivation.mp3",
      }),
    ],
    upcoming: [
      {
        id: "news-upcoming-1",
        title: "Evening News Update",
        day: "Today",
        time: "6:00 PM",
      },
    ],
  },
];

export const mockStations = [
  {
    id: "faith-talk-radio",
    name: "Faith Talk Radio",
    creatorId: "pastor-daniel",
    category: "Faith & Spirituality",
    followers: 15800,
    audioCount: 46,
    broadcastCount: 31,
    description:
      "Faith Talk Radio brings together Bible teaching, conversations, encouragement and live broadcasts.",
    latestAudio: [
      createTrack({
        id: "faith-station-audio-1",
        title: "Daily Faith",
        subtitle: "Faith Talk Radio",
        genre: "Spiritual",
        fileUrl: "/audio/sunday-message.mp3",
      }),
      createTrack({
        id: "faith-station-audio-2",
        title: "Morning Encouragement",
        subtitle: "Faith Talk Radio",
        genre: "Spiritual",
        fileUrl: "/audio/motivation.mp3",
      }),
    ],
    replays: [
      createTrack({
        id: "faith-station-replay-1",
        title: "Faith Talk Replay",
        subtitle: "Faith Talk Radio",
        genre: "Podcast",
        fileUrl: "/audio/sunday-message.mp3",
      }),
    ],
    schedule: [
      {
        id: "faith-schedule-1",
        title: "Morning Prayer",
        day: "Monday",
        time: "6:00 AM",
      },
      {
        id: "faith-schedule-2",
        title: "Faith Talk Live",
        day: "Friday",
        time: "7:00 PM",
      },
      {
        id: "faith-schedule-3",
        title: "Sunday Teaching",
        day: "Sunday",
        time: "10:00 AM",
      },
    ],
  },

  {
    id: "praise-worship-radio",
    name: "Praise & Worship Radio",
    creatorId: "james-worship",
    category: "Music",
    followers: 11200,
    audioCount: 34,
    broadcastCount: 25,
    description:
      "Continuous worship, praise sessions and live music from Echoo creators.",
    latestAudio: [
      createTrack({
        id: "worship-station-audio-1",
        title: "Morning Worship",
        subtitle: "Praise & Worship Radio",
        genre: "Music",
        fileUrl: "/audio/sunday-message.mp3",
      }),
      createTrack({
        id: "worship-station-audio-2",
        title: "Worship Flow",
        subtitle: "Praise & Worship Radio",
        genre: "Music",
        fileUrl: "/audio/deep-focus.mp3",
      }),
    ],
    replays: [
      createTrack({
        id: "worship-station-replay-1",
        title: "Praise & Worship Replay",
        subtitle: "Praise & Worship Radio",
        genre: "Music",
        fileUrl: "/audio/sunday-message.mp3",
      }),
    ],
    schedule: [
      {
        id: "worship-schedule-1",
        title: "Morning Worship",
        day: "Monday",
        time: "7:00 AM",
      },
      {
        id: "worship-schedule-2",
        title: "Praise & Worship Live",
        day: "Saturday",
        time: "5:00 PM",
      },
      {
        id: "worship-schedule-3",
        title: "Sunday Worship",
        day: "Sunday",
        time: "8:00 AM",
      },
    ],
  },

  {
    id: "echoo-news-radio",
    name: "Echoo News Radio",
    creatorId: "echoo-news-team",
    category: "News & Politics",
    followers: 7400,
    audioCount: 52,
    broadcastCount: 41,
    description:
      "Quick audio news, technology updates, business stories and current affairs.",
    latestAudio: [
      createTrack({
        id: "news-station-audio-1",
        title: "Morning News Brief",
        subtitle: "Echoo News Radio",
        genre: "Podcast",
        fileUrl: "/audio/motivation.mp3",
      }),
    ],
    replays: [
      createTrack({
        id: "news-station-replay-1",
        title: "News Update Replay",
        subtitle: "Echoo News Radio",
        genre: "Podcast",
        fileUrl: "/audio/motivation.mp3",
      }),
    ],
    schedule: [
      {
        id: "news-schedule-1",
        title: "Morning Headlines",
        day: "Daily",
        time: "7:00 AM",
      },
      {
        id: "news-schedule-2",
        title: "Evening News Update",
        day: "Daily",
        time: "6:00 PM",
      },
    ],
  },
];

export const mockBroadcasts = [
  {
    id: "faith-talk-live",
    title: "Faith Talk Live",
    subtitle: "Live with Pastor Daniel",
    description:
      "A live conversation about faith, purpose and practical Christian living.",
    category: "Faith",
    fullCategory: "Faith & Spirituality",
    creatorId: "pastor-daniel",
    stationId: "faith-talk-radio",
    listenerCount: 1240,
    listeners: 1240,
    elapsed: "38:24",
    variant: 1,
    replay: createTrack({
      id: "faith-live-replay",
      title: "Faith Talk Live Replay",
      subtitle: "Pastor Daniel",
      genre: "Spiritual",
      fileUrl: "/audio/sunday-message.mp3",
    }),
  },

  {
    id: "praise-worship-live",
    title: "Praise & Worship Live",
    subtitle: "Live with James",
    description:
      "Join James and listeners across Echoo for a live praise and worship session.",
    category: "Music",
    fullCategory: "Music • Faith & Spirituality",
    creatorId: "james-worship",
    stationId: "praise-worship-radio",
    listenerCount: 864,
    listeners: 864,
    elapsed: "21:08",
    variant: 2,
    replay: createTrack({
      id: "praise-live-replay",
      title: "Praise & Worship Replay",
      subtitle: "James",
      genre: "Music",
      fileUrl: "/audio/sunday-message.mp3",
    }),
  },

  {
    id: "news-update",
    title: "News Update",
    subtitle: "Live from Echoo News",
    description:
      "A quick live audio briefing covering today's important stories and updates.",
    category: "News",
    fullCategory: "News & Politics",
    creatorId: "echoo-news-team",
    stationId: "echoo-news-radio",
    listenerCount: 526,
    listeners: 526,
    elapsed: "12:42",
    variant: 3,
    replay: createTrack({
      id: "news-live-replay",
      title: "News Update Replay",
      subtitle: "Echoo News",
      genre: "Podcast",
      fileUrl: "/audio/motivation.mp3",
    }),
  },
];


/* ECHOO_MOCK_MEDIA_HYDRATION */

mockCreators.forEach(
  (
    creator,
    index
  ) => {
    creator.avatar =
      creator.avatar ||
      creator.profileImage ||
      MOCK_MEDIA.creators[
        index %
        MOCK_MEDIA.creators.length
      ];
  }
);


mockStations.forEach(
  (
    station,
    index
  ) => {
    const creator =
      mockCreators.find(
        (
          item
        ) =>
          String(
            item.id
          ) ===
          String(
            station.creatorId
          )
      );

    station.artwork =
      station.artwork ||
      station.coverArt ||
      station.image ||
      MOCK_MEDIA.stations[
        index %
        MOCK_MEDIA.stations.length
      ];

    station.avatar =
      station.avatar ||
      creator?.avatar ||
      station.artwork;
  }
);


mockBroadcasts.forEach(
  (
    broadcast,
    index
  ) => {
    const creator =
      mockCreators.find(
        (
          item
        ) =>
          String(
            item.id
          ) ===
          String(
            broadcast.creatorId
          )
      );

    broadcast.artwork =
      broadcast.artwork ||
      broadcast.coverArt ||
      MOCK_MEDIA.broadcasts[
        index %
        MOCK_MEDIA.broadcasts.length
      ];

    broadcast.stageArtwork =
      broadcast.stageArtwork ||
      MOCK_MEDIA.stages[
        index %
        MOCK_MEDIA.stages.length
      ];

    broadcast.creatorAvatar =
      broadcast.creatorAvatar ||
      creator?.avatar ||
      null;

    if (
      broadcast.replay &&
      !broadcast.replay
        .coverArt
    ) {
      broadcast.replay
        .coverArt =
        broadcast.artwork;
    }
  }
);


const defaultChats = {
  "faith-talk-live": [
    {
      id: "faith-chat-1",
      author: "Blessing",
      initials: "BL",
      text: "This is such a beautiful message 🙏",
      time: "Now",
      reactions: 12,
      pinned: true,
      local: false,
    },
    {
      id: "faith-chat-2",
      author: "David",
      initials: "DA",
      text: "Listening with my family ❤️",
      time: "1m",
      reactions: 8,
      pinned: false,
      local: false,
    },
    {
      id: "faith-chat-3",
      author: "Mariam",
      initials: "MA",
      text: "Joining from Abuja 👋",
      time: "2m",
      reactions: 4,
      pinned: false,
      local: false,
    },
  ],

  "praise-worship-live": [
    {
      id: "worship-chat-1",
      author: "Favour",
      initials: "FA",
      text: "Beautiful worship ❤️",
      time: "Now",
      reactions: 16,
      pinned: true,
      local: false,
    },
    {
      id: "worship-chat-2",
      author: "Samuel",
      initials: "SA",
      text: "Listening from Lagos 🙌",
      time: "1m",
      reactions: 6,
      pinned: false,
      local: false,
    },
  ],

  "news-update": [
    {
      id: "news-chat-1",
      author: "Tobi",
      initials: "TO",
      text: "Thanks for the update.",
      time: "Now",
      reactions: 3,
      pinned: false,
      local: false,
    },
  ],
};

const defaultNotifications = [
  {
    id: "notification-1",
    type: "live",
    title: "Praise & Worship is live",
    message: "James just started a live broadcast.",
    time: "2m",
    target: "/listen/live/praise-worship-live",
    read: false,
  },
  {
    id: "notification-2",
    type: "live",
    title: "Faith Talk Live",
    message: "Pastor Daniel is live now on Faith Talk Radio.",
    time: "18m",
    target: "/listen/live/faith-talk-live",
    read: false,
  },
  {
    id: "notification-3",
    type: "schedule",
    title: "Upcoming broadcast",
    message: "Sunday Worship starts tomorrow at 8:00 AM.",
    time: "1h",
    target: "/listen/stations/praise-worship-radio",
    read: true,
  },
  {
    id: "notification-4",
    type: "audio",
    title: "New audio available",
    message: "A new Echoo audio release is ready to play.",
    time: "3h",
    target: "/listen",
    read: true,
  },
];

const ensureChats = () => {
  const existing =
    readJSON(
      CHAT_KEY,
      null
    );

  if (
    existing &&
    typeof existing === "object"
  ) {
    return existing;
  }

  writeJSON(
    CHAT_KEY,
    defaultChats
  );

  return {
    ...defaultChats,
  };
};

const ensureNotifications = () => {
  const existing =
    readJSON(
      NOTIFICATION_KEY,
      null
    );

  if (
    Array.isArray(
      existing
    )
  ) {
    return existing;
  }

  writeJSON(
    NOTIFICATION_KEY,
    defaultNotifications
  );

  return [
    ...defaultNotifications,
  ];
};

export const compactNumber = (value) => {
  const number =
    Number(value) || 0;

  if (
    number >=
    1000000
  ) {
    const result =
      number / 1000000;

    return `${result
      .toFixed(
        result >= 10
          ? 0
          : 1
      )
      .replace(
        ".0",
        ""
      )}M`;
  }

  if (
    number >=
    1000
  ) {
    const result =
      number / 1000;

    return `${result
      .toFixed(
        result >= 10
          ? 0
          : 1
      )
      .replace(
        ".0",
        ""
      )}K`;
  }

  return String(
    number
  );
};

export const getCreator = (id) =>
  mockCreators.find(
    (creator) =>
      String(
        creator.id
      ) ===
      String(id)
  ) || null;

export const getStation = (id) =>
  mockStations.find(
    (station) =>
      String(
        station.id
      ) ===
      String(id)
  ) || null;

export const getBroadcast = (id) =>
  mockBroadcasts.find(
    (broadcast) =>
      String(
        broadcast.id
      ) ===
      String(id)
  ) || null;

export const getBroadcastByTitle = (title) => {
  const normalized =
    String(
      title || ""
    )
      .trim()
      .toLowerCase();

  if (!normalized) {
    return null;
  }

  return (
    mockBroadcasts.find(
      (broadcast) =>
        broadcast.title
          .trim()
          .toLowerCase() ===
        normalized
    ) || null
  );
};

export const getCreatorLive = (creatorId) =>
  mockBroadcasts.find(
    (broadcast) =>
      String(
        broadcast.creatorId
      ) ===
      String(
        creatorId
      )
  ) || null;

export const getStationLive = (stationId) =>
  mockBroadcasts.find(
    (broadcast) =>
      String(
        broadcast.stationId
      ) ===
      String(
        stationId
      )
  ) || null;

export const hydrateLiveItem = (item = {}) => {
  const byTitle =
    getBroadcastByTitle(
      item.title
    );

  const byId =
    item.id ||
    item._id
      ? getBroadcast(
          item.id ||
            item._id
        )
      : null;

  const fallback =
    byId ||
    byTitle ||
    mockBroadcasts[0];

  const listenerCount =
    Number(
      item.listenerCount ??
        item.listeners ??
        item.currentListeners ??
        fallback.listenerCount
    ) || 0;

  return {
    ...fallback,
    ...item,

    id:
      item.id ||
      item._id ||
      fallback.id,

    title:
      item.title ||
      fallback.title,

    subtitle:
      item.subtitle ||
      item.creatorName ||
      fallback.subtitle,

    description:
      item.description ||
      fallback.description,

    category:
      item.category ||
      item.genre ||
      fallback.category,

    fullCategory:
      item.fullCategory ||
      item.category ||
      item.genre ||
      fallback.fullCategory,

    creatorId:
      item.creatorId ||
      item.creator?._id ||
      item.creator?.id ||
      fallback.creatorId,

    stationId:
      item.stationId ||
      fallback.stationId,

    listenerCount,

    listeners:
      listenerCount,

    elapsed:
      item.elapsed ||
      fallback.elapsed,

    variant:
      item.variant ??
      fallback.variant,

    artwork:
      item.artwork ||
      item.coverArt ||
      item.image ||
      fallback.artwork,

    stageArtwork:
      item.stageArtwork ||
      fallback.stageArtwork ||
      item.artwork ||
      fallback.artwork,

    creatorAvatar:
      item.creatorAvatar ||
      fallback.creatorAvatar,

    replay:
      item.replay ||
      fallback.replay,
  };
};

const getCreatorFollowing = () => {
  const stored =
    readJSON(
      CREATOR_FOLLOW_KEY,
      null
    );

  if (
    Array.isArray(
      stored
    )
  ) {
    return stored;
  }

  const initial = [
    "james-worship",
  ];

  writeJSON(
    CREATOR_FOLLOW_KEY,
    initial
  );

  return initial;
};

const getStationFollowing = () => {
  const stored =
    readJSON(
      STATION_FOLLOW_KEY,
      null
    );

  if (
    Array.isArray(
      stored
    )
  ) {
    return stored;
  }

  const initial = [
    "praise-worship-radio",
  ];

  writeJSON(
    STATION_FOLLOW_KEY,
    initial
  );

  return initial;
};

const toggleId = (
  key,
  id,
  fallback = []
) => {
  const current =
    readJSON(
      key,
      fallback
    );

  const normalized =
    String(id);

  const exists =
    current.some(
      (value) =>
        String(
          value
        ) ===
        normalized
    );

  const next =
    exists
      ? current.filter(
          (value) =>
            String(
              value
            ) !==
            normalized
        )
      : [
          ...current,
          id,
        ];

  writeJSON(
    key,
    next
  );

  return !exists;
};

export const mockSocial = {
  isFollowingCreator(creatorId) {
    return getCreatorFollowing().some(
      (id) =>
        String(id) ===
        String(
          creatorId
        )
    );
  },

  isFollowingStation(stationId) {
    return getStationFollowing().some(
      (id) =>
        String(id) ===
        String(
          stationId
        )
    );
  },

  toggleCreator(creatorId) {
    return toggleId(
      CREATOR_FOLLOW_KEY,
      creatorId,
      [
        "james-worship",
      ]
    );
  },

  toggleStation(stationId) {
    return toggleId(
      STATION_FOLLOW_KEY,
      stationId,
      [
        "praise-worship-radio",
      ]
    );
  },

  getFollowingCreators() {
    const ids =
      getCreatorFollowing();

    return mockCreators.filter(
      (creator) =>
        ids.some(
          (id) =>
            String(id) ===
            String(
              creator.id
            )
        )
    );
  },

  getFollowingStations() {
    const ids =
      getStationFollowing();

    return mockStations.filter(
      (station) =>
        ids.some(
          (id) =>
            String(id) ===
            String(
              station.id
            )
        )
    );
  },

  getFollowedLiveCount() {
    return mockBroadcasts.filter(
      (broadcast) =>
        this.isFollowingCreator(
          broadcast.creatorId
        ) ||
        this.isFollowingStation(
          broadcast.stationId
        )
    ).length;
  },

  getChat(broadcastId) {
    const chats =
      ensureChats();

    return [
      ...(chats[
        broadcastId
      ] || []),
    ];
  },

  sendChat(
    broadcastId,
    text,
    replyTo = null,
    audioLink = null
  ) {
    const chats =
      ensureChats();

    const clean =
      String(
        text || ""
      ).trim();

    const message = {
      id:
        `chat-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      author: "You",

      initials: "YO",

      text: clean,

      time: "Now",

      reactions: 0,

      pinned: false,

      local: true,

      audioTimestamp:
        audioLink &&
        Number.isFinite(
          Number(
            audioLink.timestamp
          )
        )
          ? Math.max(
              0,
              Math.floor(
                Number(
                  audioLink.timestamp
                )
              )
            )
          : null,

      audioTrackId:
        audioLink?.trackId ||
        null,

      audioTitle:
        audioLink?.title ||
        null,

      replyTo:
        replyTo
          ? {
              author:
                replyTo.author,

              text:
                replyTo.text,
            }
          : null,
    };

    chats[
      broadcastId
    ] = [
      ...(chats[
        broadcastId
      ] || []),

      message,
    ];

    writeJSON(
      CHAT_KEY,
      chats
    );

    return message;
  },

  isReacted(messageId) {
    const reactions =
      readJSON(
        REACTION_KEY,
        []
      );

    return reactions.some(
      (id) =>
        String(id) ===
        String(
          messageId
        )
    );
  },

  toggleReaction(messageId) {
    return toggleId(
      REACTION_KEY,
      messageId,
      []
    );
  },

  getNotifications() {
    return ensureNotifications();
  },

  markNotificationRead(notificationId) {
    const notifications =
      ensureNotifications().map(
        (
          notification
        ) =>
          String(
            notification.id
          ) ===
          String(
            notificationId
          )
            ? {
                ...notification,
                read: true,
              }
            : notification
      );

    writeJSON(
      NOTIFICATION_KEY,
      notifications
    );

    return notifications;
  },

  markAllNotificationsRead() {
    const notifications =
      ensureNotifications().map(
        (
          notification
        ) => ({
          ...notification,
          read: true,
        })
      );

    writeJSON(
      NOTIFICATION_KEY,
      notifications
    );

    return notifications;
  },
};

export default {
  mockCreators,
  mockStations,
  mockBroadcasts,
  compactNumber,
  getCreator,
  getStation,
  getBroadcast,
  getBroadcastByTitle,
  getCreatorLive,
  getStationLive,
  hydrateLiveItem,
  mockSocial,
};