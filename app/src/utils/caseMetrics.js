function filled(value) {
  return Boolean(String(value || '').trim());
}

export function hasCaseSubstance(caseRecord, documents = [], evaluation = null) {
  const intake = caseRecord?.intake || {};
  return Boolean(
    evaluation ||
    documents.length ||
    filled(caseRecord?.family_narrative) ||
    filled(intake.narrative) ||
    filled(intake.desired_outcome) ||
    (intake.desired_outcomes || []).some(filled),
  );
}

export function caseGapMetric({ caseRecord, documents = [], evaluation = null, checklist = [] } = {}) {
  const caseReadGaps = evaluation?.result?.gaps || [];
  if (caseReadGaps.length) {
    return {
      value: caseReadGaps.length,
      detail: 'Case Read gaps.',
    };
  }

  if (!hasCaseSubstance(caseRecord, documents, evaluation)) {
    return {
      value: 0,
      detail: 'Add a story or evidence to assess gaps.',
    };
  }

  const value = checklist.filter((item) => ['missing', 'recommended'].includes(item?.status)).length;
  return {
    value,
    detail: 'Missing or recommended evidence.',
  };
}

export function recordsRequestMetric({ evaluation = null, recordsDrafts = [] } = {}) {
  if (!evaluation) {
    return {
      value: 0,
      detail: 'Run a Case Read to draft requests.',
    };
  }

  return {
    value: recordsDrafts.length,
    detail: 'Drafts from the Case Read.',
  };
}
