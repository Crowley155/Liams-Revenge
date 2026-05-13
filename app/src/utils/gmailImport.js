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

export function friendlyGmailError(value) {
  const message = String(value || '').trim();
  const lowered = message.toLowerCase();
  if (
    lowered.includes('gmail api')
    && (lowered.includes('not been used') || lowered.includes('disabled'))
  ) {
    return 'Gmail access is approved, but Gmail API is not enabled for this Google Cloud project. Enable Gmail API in Google Cloud, then check Gmail access again.';
  }
  if (message) return message;
  return 'Gmail could not be reached. Check Gmail access, then try again.';
}

function arrayFromRuleValue(value, keyword = false) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return keyword ? parseGmailKeywordInput(value) : parseGmailRuleInput(value);
}

export function normalizeGmailRule(rule = {}) {
  return {
    domains: arrayFromRuleValue(rule.domains).map((item) => item.toLowerCase().replace(/^@+/, '')),
    email_addresses: arrayFromRuleValue(rule.email_addresses).map((item) => item.toLowerCase()),
    keywords: arrayFromRuleValue(rule.keywords, true),
    include_attachments: rule.include_attachments !== false,
  };
}

export function removeGmailRuleValue(rule, field, value) {
  const normalized = normalizeGmailRule(rule);
  const target = String(value || '').trim().toLowerCase();
  const values = Array.isArray(normalized[field]) ? normalized[field] : [];
  return {
    ...normalized,
    [field]: values.filter((item) => String(item || '').trim().toLowerCase() !== target),
  };
}

export function formatGmailRuleSummary(rule = {}) {
  const normalized = normalizeGmailRule(rule);
  const domainCount = normalized.domains.length;
  const emailCount = normalized.email_addresses.length;
  const keywordCount = normalized.keywords.length;
  const identityParts = [];
  if (domainCount) identityParts.push(`${domainCount} domain${domainCount === 1 ? '' : 's'}`);
  if (emailCount) identityParts.push(`${emailCount} email${emailCount === 1 ? '' : 's'}`);
  if (!identityParts.length && !keywordCount) return 'No saved Gmail search rule yet.';
  if (!identityParts.length) return `Messages matching ${keywordCount} keyword${keywordCount === 1 ? '' : 's'}.`;
  const identity = identityParts.join(' or ');
  if (!keywordCount) return `Messages from or to ${identity}.`;
  return `Messages from or to ${identity}, narrowed by ${keywordCount} keyword${keywordCount === 1 ? '' : 's'}.`;
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
