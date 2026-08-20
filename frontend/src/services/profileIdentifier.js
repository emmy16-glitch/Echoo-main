export const getCreatorProfileIdentifier = (creator) => {
  if (creator === null || creator === undefined) return '';

  if (typeof creator === 'string' || typeof creator === 'number') {
    return String(creator).trim();
  }

  return String(
    creator.id ||
      creator._id ||
      creator.creatorId ||
      creator.userId ||
      creator.username ||
      ''
  ).trim();
};

export const getCreatorProfilePath = (creator) => {
  const identifier = getCreatorProfileIdentifier(creator);
  return identifier ? `/listen/creator/${encodeURIComponent(identifier)}` : '';
};
