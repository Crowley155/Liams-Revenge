export const EVIDENCE_TYPES = [
  { value: 'communications', label: 'Emails, texts, portal messages' },
  { value: 'incident_report', label: 'Incident report' },
  { value: 'iep_504', label: 'IEP, 504, evaluation, prior notice' },
  { value: 'meeting_notes', label: 'Meeting notes' },
  { value: 'photo', label: 'Photo or screenshot' },
  { value: 'medical', label: 'Medical or safety record' },
  { value: 'agency_letter', label: 'Agency or complaint letter' },
  { value: 'other', label: 'Other evidence' },
];

export const EMPTY_SUPPORT = {
  attorney_contact_opt_in: false,
  advocacy_contact_opt_in: false,
  media_contact_opt_in: false,
  contact_preference: '',
  sensitivity_notes: '',
  share_summary_consent: false,
};

export function formatLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function StatusPill({ status }) {
  const style = {
    indexed: 'bg-success/15 text-success border-success/30',
    processing: 'bg-accent/15 text-accent border-accent/30',
    uploaded: 'bg-accent/15 text-accent border-accent/30',
    needs_review: 'bg-warning/15 text-warning border-warning/30',
    failed: 'bg-danger/15 text-danger border-danger/30',
    complete: 'bg-success/15 text-success border-success/30',
    recommended: 'bg-warning/15 text-warning border-warning/30',
    missing: 'bg-danger/15 text-danger border-danger/30',
    fulfilled: 'bg-success/15 text-success border-success/30',
    denied: 'bg-danger/15 text-danger border-danger/30',
    partial: 'bg-warning/15 text-warning border-warning/30',
    sent: 'bg-accent/15 text-accent border-accent/30',
    draft: 'bg-text-dim/10 text-text-dim border-border',
    high: 'bg-warning/15 text-warning border-warning/30',
    urgent: 'bg-danger/15 text-danger border-danger/30',
    strong: 'bg-success/15 text-success border-success/30',
    mixed: 'bg-warning/15 text-warning border-warning/30',
    thin: 'bg-danger/15 text-danger border-danger/30',
  }[status] || 'bg-text-dim/10 text-text-dim border-border';

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}>
      {formatLabel(status || 'pending')}
    </span>
  );
}

export function Panel({ title, eyebrow, action, children }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/80">{eyebrow}</p>}
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed text-text-dim">{detail}</p>}
    </div>
  );
}

export function checklistStatusCount(items, status) {
  return (items || []).filter((item) => item.status === status).length;
}

export function formatBytes(value = 0) {
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildPacketText(packet, caseRecord) {
  if (!packet) return '';
  const lines = [
    packet.title,
    '',
    packet.disclaimer,
    '',
    'Case Summary',
    `District: ${caseRecord?.intake?.district || 'Not entered'}`,
    `School: ${caseRecord?.intake?.school || 'Not entered'}`,
    `Issue categories: ${(caseRecord?.intake?.issue_categories || [caseRecord?.intake?.issue_type]).filter(Boolean).map(formatLabel).join(', ') || 'Not entered'}`,
    `Urgency: ${formatLabel(caseRecord?.intake?.urgency_level || 'routine')}`,
    '',
    'Parent Story',
    packet.parent_story || 'No story entered.',
    '',
    'What USDWatch Sees',
    packet.what_usdwatch_sees || 'Run an evaluation to generate this section.',
    '',
    'Evidence Checklist',
    ...(packet.evidence_checklist || []).map((item) => `- [${formatLabel(item.status)}] ${item.item}: ${item.why_it_matters}`),
    '',
    'Records To Request',
    ...(packet.records_request_drafts || []).map((record) => [
      `${record.title} (${formatLabel(record.priority)})`,
      `Custodian: ${record.custodian || 'Records custodian'}`,
      `Why: ${record.reason}`,
      `Request language: ${record.request_language}`,
    ].join('\n')),
    '',
    'Questions To Ask The School',
    ...(packet.questions_to_ask_school || []).map((question) => `- ${question}`),
    '',
    'Next Steps',
    ...(packet.next_steps || []).map((step) => `- ${step}`),
  ];
  return lines.filter((line) => line !== undefined && line !== null).join('\n');
}
