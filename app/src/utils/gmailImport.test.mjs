import assert from 'node:assert/strict';
import test from 'node:test';

import {
  friendlyGmailError,
  formatGmailRuleSummary,
  gmailRuleHasCriteria,
  removeGmailRuleValue,
  parseGmailRuleInput,
  shouldAutoSelectGmailMessage,
} from './gmailImport.js';

test('parseGmailRuleInput trims comma and whitespace separated values', () => {
  assert.deepEqual(parseGmailRuleInput(' usd232.org, mize.usd232.org  principal@usd232.org '), [
    'usd232.org',
    'mize.usd232.org',
    'principal@usd232.org',
  ]);
});

test('gmailRuleHasCriteria requires at least one searchable rule value', () => {
  assert.equal(gmailRuleHasCriteria({ domains: '', email_addresses: '', keywords: '' }), false);
  assert.equal(gmailRuleHasCriteria({ domains: 'usd232.org', email_addresses: '', keywords: '' }), true);
});

test('removeGmailRuleValue removes one saved value without touching the rest of the rule', () => {
  const rule = {
    domains: ['usd232.org', 'jcocogov.org'],
    email_addresses: ['principal@usd232.org'],
    keywords: ['incident'],
    include_attachments: true,
  };

  assert.deepEqual(removeGmailRuleValue(rule, 'domains', 'usd232.org'), {
    domains: ['jcocogov.org'],
    email_addresses: ['principal@usd232.org'],
    keywords: ['incident'],
    include_attachments: true,
  });
});

test('formatGmailRuleSummary explains the saved rule in parent language', () => {
  assert.equal(
    formatGmailRuleSummary({
      domains: ['usd232.org', 'jcocogov.org'],
      email_addresses: ['principal@usd232.org'],
      keywords: ['incident', 'supervision'],
    }),
    'Messages from or to 2 domains or 1 email, narrowed by 2 keywords.',
  );
  assert.equal(formatGmailRuleSummary({ domains: [], email_addresses: [], keywords: [] }), 'No saved Gmail search rule yet.');
});

test('shouldAutoSelectGmailMessage only preselects likely relevant messages', () => {
  assert.equal(shouldAutoSelectGmailMessage({ case_relevance_label: 'likely_relevant', case_relevance_score: 0.74 }), true);
  assert.equal(shouldAutoSelectGmailMessage({ case_relevance_label: 'possible_match', case_relevance_score: 0.58 }), false);
  assert.equal(shouldAutoSelectGmailMessage({ case_relevance_label: 'review_first', case_relevance_score: 0.22 }), false);
});

test('friendlyGmailError explains disabled Gmail API setup without raw Google JSON', () => {
  const message = friendlyGmailError(
    'Gmail API request failed: 403 { "error": { "code": 403, "message": "Gmail API has not been used in project 649676222654 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=649676222654 then retry." } }',
  );

  assert.equal(
    message,
    'Gmail access is approved, but Gmail API is not enabled for this Google Cloud project. Enable Gmail API in Google Cloud, then check Gmail access again.',
  );
  assert.equal(message.includes('{'), false);
  assert.equal(message.includes('console.developers.google.com'), false);
});
