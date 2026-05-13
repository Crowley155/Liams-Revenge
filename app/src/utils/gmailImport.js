export function parseGmailRuleInput(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseGmailKeywordInput(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function gmailRuleHasCriteria(rule) {
  return Boolean(
    parseGmailRuleInput(rule?.domains).length
    || parseGmailRuleInput(rule?.email_addresses).length
    || parseGmailKeywordInput(rule?.keywords).length
  );
}

export function shouldAutoSelectGmailMessage(message) {
  return message?.case_relevance_label === 'likely_relevant'
    || Number(message?.case_relevance_score || 0) >= 0.7;
}

export function gmailRelevanceLabel(message) {
  const label = message?.case_relevance_label || '';
  if (label === 'likely_relevant') return 'Likely relevant';
  if (label === 'possible_match') return 'Possible match';
  if (label === 'review_first') return 'Review first';
  return 'Not scored';
}
