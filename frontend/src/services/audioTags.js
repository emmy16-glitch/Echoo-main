const MAX_AUDIO_TAGS = 20;
const MAX_AUDIO_TAG_LENGTH = 30;

export const normalizeAudioTags = (value) => {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]/)
      : [];

  return [...new Set(values
    .map((tag) => String(tag ?? '').trim().replace(/^#/, '').trim())
    .filter(Boolean)
    .map((tag) => tag.slice(0, MAX_AUDIO_TAG_LENGTH)))].slice(0, MAX_AUDIO_TAGS);
};
