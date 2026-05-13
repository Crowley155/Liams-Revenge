import { USD232_POLICY_REFORM_SECTIONS } from '../data/policyReforms.js';

function normalize(value) {
  return String(value || '').toLowerCase();
}

function caseSearchText(caseRecord) {
  const intake = caseRecord?.intake || {};
  return [
    caseRecord?.id,
    caseRecord?.title,
    caseRecord?.status,
    intake.district,
    intake.school,
    intake.issue_type,
    ...(intake.issue_categories || []),
  ].map(normalize).join(' ');
}

export function isUsd232JcprdCase(caseRecord) {
  const text = caseSearchText(caseRecord);
  const hasUsd232 = /\busd\s*232\b/.test(text) || text.includes('usd232');
  const hasJcprdSignal =
    text.includes('jcprd') ||
    text.includes('johnson county park') ||
    text.includes('crowley') ||
    text.includes('mize elementary') ||
    text.includes('demo');
  return hasUsd232 && hasJcprdSignal;
}

export function getCasePolicyReforms(caseRecord) {
  return isUsd232JcprdCase(caseRecord) ? USD232_POLICY_REFORM_SECTIONS : [];
}

export function hasCasePolicyReforms(caseRecord) {
  return getCasePolicyReforms(caseRecord).length > 0;
}

export function policyReformCount(sections = USD232_POLICY_REFORM_SECTIONS) {
  return (sections || []).reduce((sum, section) => sum + (section.reforms || []).length, 0);
}
