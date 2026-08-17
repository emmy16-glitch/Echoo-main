const MOMENTS_KEY =
  "echoo-moments-v1";

const readJSON = (
  key,
  fallback
) => {
  try {
    const value =
      JSON.parse(
        localStorage.getItem(
          key
        )
      );

    return value ??
      fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = (
  key,
  value
) => {
  localStorage.setItem(
    key,
    JSON.stringify(
      value
    )
  );
};

const normalizeSeconds = (
  value
) => {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(
      number
    )
  );
};

export const parseTimestamp =
  (
    value
  ) => {
    if (
      typeof value ===
      "number"
    ) {
      return normalizeSeconds(
        value
      );
    }

    const text =
      String(
        value ||
        ""
      ).trim();

    if (!text) {
      return 0;
    }

    if (
      /^\d+$/.test(
        text
      )
    ) {
      return normalizeSeconds(
        Number(
          text
        )
      );
    }

    const parts =
      text
        .split(":")
        .map(
          (
            part
          ) =>
            Number(
              part
            )
        );

    if (
      parts.some(
        (
          part
        ) =>
          !Number.isFinite(
            part
          )
      )
    ) {
      return 0;
    }

    if (
      parts.length ===
      3
    ) {
      return normalizeSeconds(
        parts[0] *
          3600 +
        parts[1] *
          60 +
        parts[2]
      );
    }

    if (
      parts.length ===
      2
    ) {
      return normalizeSeconds(
        parts[0] *
          60 +
        parts[1]
      );
    }

    return normalizeSeconds(
      parts[0]
    );
  };

export const formatTimestamp =
  (
    value
  ) => {
    const seconds =
      normalizeSeconds(
        value
      );

    const hours =
      Math.floor(
        seconds /
          3600
      );

    const minutes =
      Math.floor(
        (
          seconds %
          3600
        ) /
          60
      );

    const remaining =
      seconds %
      60;

    if (
      hours >
      0
    ) {
      return [
        hours,
        String(
          minutes
        ).padStart(
          2,
          "0"
        ),
        String(
          remaining
        ).padStart(
          2,
          "0"
        ),
      ].join(":");
    }

    return [
      minutes,
      String(
        remaining
      ).padStart(
        2,
        "0"
      ),
    ].join(":");
  };

const readMoments =
  () => {
    const value =
      readJSON(
        MOMENTS_KEY,
        []
      );

    return Array.isArray(
      value
    )
      ? value
      : [];
  };

const notify =
  (
    broadcastId
  ) => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(
        "echoo:moments-changed",
        {
          detail: {
            broadcastId,
          },
        }
      )
    );
  };

const momentService = {
  getAll() {
    return [
      ...readMoments(),
    ];
  },

  getByBroadcast(
    broadcastId
  ) {
    return readMoments()
      .filter(
        (
          moment
        ) =>
          String(
            moment.broadcastId
          ) ===
          String(
            broadcastId
          )
      )
      .sort(
        (
          first,
          second
        ) =>
          new Date(
            second.createdAt
          ) -
          new Date(
            first.createdAt
          )
      );
  },

  getById(
    momentId
  ) {
    return (
      readMoments().find(
        (
          moment
        ) =>
          String(
            moment.id
          ) ===
          String(
            momentId
          )
      ) ||
      null
    );
  },

  create({
    broadcastId,
    trackId = null,
    quote,
    creator = "Echoo Creator",
    room = "Echoo",
    timestamp = 0,
    clipDuration = 28,
    sourceTitle = "",
  }) {
    const clean =
      String(
        quote ||
        ""
      )
        .trim()
        .slice(
          0,
          220
        );

    if (!clean) {
      throw new Error(
        "A Moment needs some text."
      );
    }

    if (!broadcastId) {
      throw new Error(
        "Broadcast ID is missing."
      );
    }

    const moment = {
      id:
        `moment-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      broadcastId,

      trackId,

      quote:
        clean,

      creator,

      room,

      timestamp:
        normalizeSeconds(
          timestamp
        ),

      clipDuration:
        Math.max(
          1,
          Math.min(
            60,
            normalizeSeconds(
              clipDuration
            ) ||
              28
          )
        ),

      sourceTitle:
        sourceTitle ||
        room,

      createdAt:
        new Date()
          .toISOString(),

      local:
        true,
    };

    const next = [
      moment,
      ...readMoments(),
    ];

    writeJSON(
      MOMENTS_KEY,
      next
    );

    notify(
      broadcastId
    );

    return moment;
  },

  remove(
    momentId
  ) {
    const current =
      readMoments();

    const target =
      current.find(
        (
          moment
        ) =>
          String(
            moment.id
          ) ===
          String(
            momentId
          )
      );

    const next =
      current.filter(
        (
          moment
        ) =>
          String(
            moment.id
          ) !==
          String(
            momentId
          )
      );

    writeJSON(
      MOMENTS_KEY,
      next
    );

    if (
      target
    ) {
      notify(
        target.broadcastId
      );
    }

    return next;
  },

  buildShareUrl(
    moment
  ) {
    if (
      typeof window ===
      "undefined"
    ) {
      return "";
    }

    const url =
      new URL(
        window.location.href
      );

    url.searchParams.delete(
      "state"
    );

    url.searchParams.set(
      "moment",
      moment.id
    );

    url.searchParams.set(
      "t",
      String(
        normalizeSeconds(
          moment.timestamp
        )
      )
    );

    return url.toString();
  },
};

export default momentService;
