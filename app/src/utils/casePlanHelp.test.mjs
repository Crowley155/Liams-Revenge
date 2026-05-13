import assert from 'node:assert/strict';
import test from 'node:test';

import { CASE_PLAN_HELP } from './casePlanHelp.js';

test('case plan help copy stays short and parent-facing', () => {
  assert.equal(
    CASE_PLAN_HELP.familyNarrative,
    'Use this for your plain-English account: what happened, who was affected, what changed afterward, and what still worries you.',
  );
  assert.equal(
    CASE_PLAN_HELP.desiredOutcome,
    'Use this for what you want changed, fixed, provided, documented, or prevented.',
  );
  assert.equal(
    CASE_PLAN_HELP.policyReforms,
    'These are broader system or policy changes tied to this case. They are separate from the personal outcome above.',
  );
  assert.equal(
    CASE_PLAN_HELP.caseReadSummary,
    'This is a working read of the case file to help you spot themes, gaps, and next steps. It is not legal advice or a final decision.',
  );
  Object.values(CASE_PLAN_HELP).forEach((copy) => {
    assert.equal(copy.includes('Chat helps'), false);
    assert.ok(copy.length <= 140);
  });
});
