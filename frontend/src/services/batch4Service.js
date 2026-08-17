import {
  apiRequest,
} from "./api.js";

const normalizeUser = (
  value
) => {
  if (!value) {
    return {
      id: null,
      username: "",
      displayName: "",
      avatar: null,
    };
  }

  if (
    typeof value ===
    "string"
  ) {
    return {
      id: value,
      username: "",
      displayName: "",
      avatar: null,
    };
  }

  return {
    id:
      value.id ||
      value._id ||
      null,

    username:
      value.username ||
      "",

    displayName:
      value.displayName ||
      value.fullname ||
      value.username ||
      "",

    avatar:
      value.avatar ||
      value.profileImage ||
      null,
  };
};

const normalizeReaction = (
  reaction
) => {
  const user =
    normalizeUser(
      reaction?.userId
    );

  return {
    ...reaction,

    emoji:
      reaction?.emoji ||
      "",

    userId:
      user.id,

    user,
  };
};

export const normalizeChatMessage = (
  message
) => {
  if (!message) {
    return null;
  }

  const user =
    normalizeUser(
      message.userId
    );

  return {
    ...message,

    id:
      message.id ||
      message._id ||
      null,

    _id:
      message._id ||
      message.id ||
      null,

    broadcastId:
      typeof message.broadcastId ===
      "object"
        ? (
            message.broadcastId
              ?.id ||
            message.broadcastId
              ?._id
          )
        : message.broadcastId,

    user,

    userId:
      user.id ||
      message.userId ||
      null,

    username:
      message.username ||
      user.username ||
      "listener",

    displayName:
      message.displayName ||
      user.displayName ||
      message.username ||
      "Echoo Listener",

    avatar:
      message.avatar ||
      user.avatar ||
      null,

    content:
      message.content ||
      "",

    type:
      message.type ||
      "message",

    reactions:
      Array.isArray(
        message.reactions
      )
        ? message.reactions.map(
            normalizeReaction
          )
        : [],

    isPinned:
      Boolean(
        message.isPinned
      ),

    createdAt:
      message.createdAt ||
      message.sentAt ||
      new Date()
        .toISOString(),
  };
};

const normalizeList = (
  response
) => {
  const raw =
    Array.isArray(
      response?.data
    )
      ? response.data
      : [];

  return raw
    .map(
      normalizeChatMessage
    )
    .filter(Boolean);
};

const batch4Service = {
  getMessages: async (
    broadcastId,
    options = {}
  ) => {
    const params =
      new URLSearchParams();

    params.set(
      "page",
      String(
        options.page ||
        1
      )
    );

    params.set(
      "limit",
      String(
        options.limit ||
        100
      )
    );

    if (
      options.before
    ) {
      params.set(
        "before",
        options.before
      );
    }

    const response =
      await apiRequest(
        `/chat/broadcast/${encodeURIComponent(
          broadcastId
        )}/messages?${params.toString()}`
      );

    return {
      ...response,

      data:
        normalizeList(
          response
        ),
    };
  },

  sendMessage: async (
    broadcastId,
    content
  ) => {
    const response =
      await apiRequest(
        `/chat/broadcast/${encodeURIComponent(
          broadcastId
        )}/messages`,
        {
          method:
            "POST",

          body:
            JSON.stringify({
              content,
            }),
        }
      );

    return {
      ...response,

      data:
        normalizeChatMessage(
          response?.data
        ),
    };
  },

  deleteMessage: async (
    messageId
  ) => {
    return apiRequest(
      `/chat/messages/${encodeURIComponent(
        messageId
      )}`,
      {
        method:
          "DELETE",
      }
    );
  },

  react: async (
    messageId,
    emoji
  ) => {
    return apiRequest(
      `/chat/messages/${encodeURIComponent(
        messageId
      )}/reactions`,
      {
        method:
          "POST",

        body:
          JSON.stringify({
            emoji,
          }),
      }
    );
  },

  pin: async (
    messageId
  ) => {
    return apiRequest(
      `/chat/messages/${encodeURIComponent(
        messageId
      )}/pin`,
      {
        method:
          "POST",
      }
    );
  },

  getPinned: async (
    broadcastId
  ) => {
    const response =
      await apiRequest(
        `/chat/broadcast/${encodeURIComponent(
          broadcastId
        )}/pinned`
      );

    return {
      ...response,

      data:
        normalizeList(
          response
        ),
    };
  },

  getStats: async (
    broadcastId
  ) => {
    return apiRequest(
      `/chat/broadcast/${encodeURIComponent(
        broadcastId
      )}/stats`
    );
  },
};

export default batch4Service;
