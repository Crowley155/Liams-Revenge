import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCasePolicyReforms,
  hasCasePolicyReforms,
  policyReformCount,
} from './casePolicyReforms.js';

test('USD 232 JCPRD case exposes the existing policy reform list', () => {
  const caseRecord = {
    title: 'Crowley v. USD 232 / JCPRD',
    status: 'active',
    intake: {
      district: 'USD 232',
      school: 'Mize Elementary',
    },
  };

  const sections = getCasePolicyReforms(caseRecord);

  assert.equal(hasCasePolicyReforms(caseRecord), true);
  assert.equal(policyReformCount(sections), 11);
  assert.deepEqual(sections.map((section) => section.entity), ['JCPRD', 'USD 232', 'Joint']);
  assert.ok(sections.some((section) => section.reforms.some((reform) => reform.title === 'Activate Lease Enforcement Authority')));
});

test('ordinary cases do not show USD 232-specific reforms', () => {
  const caseRecord = {
    title: 'Smith v. Example District',
    status: 'active',
    intake: {
      district: 'Example USD',
      school: 'Example Elementary',
    },
  };

  assert.equal(hasCasePolicyReforms(caseRecord), false);
  assert.deepEqual(getCasePolicyReforms(caseRecord), []);
});
