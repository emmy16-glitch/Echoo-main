export const MOCK_MEDIA = {
  creators: [
    "/mock-media/creator-stage.png",
    "/mock-media/creator-speaking.png",
    "/mock-media/creator-white.png",
    "/mock-media/creator-prayer.png",
  ],

  stations: [
    "/mock-media/creator-stage.png",
    "/mock-media/creator-prayer.png",
    "/mock-media/creator-white.png",
    "/mock-media/creator-speaking.png",
  ],

  broadcasts: [
    "/mock-media/broadcast-blood.png",
    "/mock-media/broadcast-no-turning-back.png",
    "/mock-media/broadcast-serving.png",
    "/mock-media/broadcast-bible-study.png",
  ],

  stages: [
    "/mock-media/creator-speaking.png",
    "/mock-media/creator-stage.png",
    "/mock-media/creator-white.png",
    "/mock-media/creator-prayer.png",
  ],

  audio: [
    "/mock-media/broadcast-bible-study.png",
    "/mock-media/broadcast-serving.png",
    "/mock-media/broadcast-no-turning-back.png",
    "/mock-media/broadcast-blood.png",
  ],

  playlists: [
    "/mock-media/broadcast-blood.png",
    "/mock-media/broadcast-bible-study.png",
    "/mock-media/broadcast-serving.png",
    "/mock-media/broadcast-no-turning-back.png",
  ],
};


const normalizeKey = (
  value
) =>
  String(
    value ||
    "echoo"
  )
    .toLowerCase()
    .trim();


const knownAudioMedia = (
  value
) => {
  const key =
    normalizeKey(
      value
    );

  if (
    key.includes(
      "first track"
    )
  ) {
    return (
      "/mock-media/broadcast-bible-study.png"
    );
  }

  if (
    key.includes(
      "updated track"
    )
  ) {
    return (
      "/mock-media/broadcast-serving.png"
    );
  }

  if (
    key.includes(
      "daily motivation"
    )
  ) {
    return (
      "/mock-media/broadcast-no-turning-back.png"
    );
  }

  if (
    key.includes(
      "sunday"
    )
  ) {
    return (
      "/mock-media/broadcast-blood.png"
    );
  }

  if (
    key.includes(
      "deep focus"
    )
  ) {
    return (
      "/mock-media/broadcast-serving.png"
    );
  }

  if (
    key.includes(
      "creative mind"
    )
  ) {
    return (
      "/mock-media/broadcast-bible-study.png"
    );
  }

  return null;
};


const hashValue = (
  value
) => {
  const text =
    normalizeKey(
      value
    );

  let hash =
    2166136261;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash ^=
      text.charCodeAt(
        index
      );

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return hash >>> 0;
};


export const getMockMediaForKey = (
  key,
  type = "audio"
) => {
  if (
    type ===
    "audio"
  ) {
    const known =
      knownAudioMedia(
        key
      );

    if (known) {
      return known;
    }
  }

  const collection =
    MOCK_MEDIA[
      type
    ] ||
    MOCK_MEDIA.audio;

  if (
    !collection?.length
  ) {
    return null;
  }

  return collection[
    hashValue(
      key
    ) %
      collection.length
  ];
};


export const resolveMedia = (
  realMedia,
  key,
  type = "audio"
) =>
  realMedia ||
  getMockMediaForKey(
    key,
    type
  );


export default MOCK_MEDIA;
