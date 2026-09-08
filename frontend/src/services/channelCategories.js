// These values mirror backend/src/models/Station.js. Labels are presentation;
// values are the only strings that may cross the station API boundary.
export const CHANNEL_CATEGORY_OPTIONS = Object.freeze([
  { value: 'Faith & Spirituality', label: 'Faith & Spirituality' },
  { value: 'Education', label: 'Education' },
  { value: 'News & Politics', label: 'News & Politics' },
  { value: 'Business', label: 'Business' },
  { value: 'Health & Wellness', label: 'Health & Wellness' },
  { value: 'Entertainment', label: 'Entertainment' },
  { value: 'Technology', label: 'Technology' },
  { value: 'Sports', label: 'Sports' },
  { value: 'Music', label: 'Music' },
  { value: 'Podcast', label: 'Podcast' },
  { value: 'Comedy', label: 'Comedy' },
  { value: 'Storytelling', label: 'Storytelling' },
  { value: 'Other', label: 'Other' },
]);

export const CHANNEL_CATEGORY_VALUES = Object.freeze(
  CHANNEL_CATEGORY_OPTIONS.map(({ value }) => value)
);

export const isChannelCategory = (value) => CHANNEL_CATEGORY_VALUES.includes(value);

export const canonicalChannelCategory = (value) => {
  const category = String(value || '').trim();
  return isChannelCategory(category) ? category : 'Other';
};
