const CODE_LIKE_PATTERNS = [
  /```/,
  /<\/?\s*(?:script|style|iframe|object|embed|html|body|div|pre|code)\b[^>]*>/i,
  /(?:^|\s)(?:const|let|var|function|class|import|export|def|return)\s+[A-Za-z_$][\w$]*/,
  /(?:=>|==={2}|!==|&&|\|\|)/,
  /[{};]/,
  /(?:^|\s)(?:SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i,
];

export function containsCodeLikeContent(value) {
  return typeof value === 'string' && CODE_LIKE_PATTERNS.some((pattern) => pattern.test(value));
}

export function validateHumanText(value, { maxLength, requiredMessage, codeMessage }) {
  if (typeof value !== 'string') return requiredMessage;

  const text = value.trim();
  if (!text) return requiredMessage;
  if (typeof maxLength === 'number' && text.length > maxLength) {
    return `Text cannot exceed ${maxLength} characters`;
  }
  if (containsCodeLikeContent(text)) return codeMessage;
  return null;
}
