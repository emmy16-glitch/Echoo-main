export const escapeRegexLiteral = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const boundedSearchText = (value, { maxLength = 120 } = {}) => {
  const text = String(value || '').trim();
  if (text.length > maxLength) {
    const error = new Error(`Search text cannot exceed ${maxLength} characters`);
    error.status = 400;
    error.code = 'SEARCH_TOO_LONG';
    throw error;
  }
  return text;
};

export const literalSearchPattern = (value, options) =>
  escapeRegexLiteral(boundedSearchText(value, options));

export default {
  escapeRegexLiteral,
  boundedSearchText,
  literalSearchPattern,
};
