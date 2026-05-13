import assert from 'node:assert/strict';
import test from 'node:test';

import {
  gmailRuleHasCriteria,
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

test('shouldAutoSelectGmailMessage only preselects likely relevant messages', () => {
  assert.equal(shouldAutoSelectGmailMessage({ case_relevance_label: 'likely_relevant', case_relevance_score: 0.74 }), true);
  assert.equal(shouldAutoSelectGmailMessage({ case_relevance_label: 'possible_match', case_relevance_score: 0.58 }), false);
  assert.equal(shouldAutoSelectGmailMessage({ case_relevance_label: 'review_first', case_relevance_score: 0.22 }), false);
});
