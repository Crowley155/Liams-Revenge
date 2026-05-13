const HIDDEN_ENV_CHARS = /[\uFEFF\u200B-\u200D\u2060]/g;

export function cleanEnvValue(value) {
  return String(value ?? '').replace(HIDDEN_ENV_CHARS, '').trim();
}

export function firstCleanEnvValue(...values) {
  for (const value of values) {
    const cleaned = cleanEnvValue(value);
    if (cleaned) return cleaned;
  }
  return undefined;
}
