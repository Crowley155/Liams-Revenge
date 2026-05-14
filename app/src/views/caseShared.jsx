import { useId } from 'react';
import { Info } from 'lucide-react';

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

const STATUS_LABELS = {
  indexed: 'Ready',
  processing: 'Reading file',
  uploaded: 'Queued',
  needs_review: 'Needs review',
  failed: 'Needs attention',
  complete: 'Complete',
  fulfilled: 'Fulfilled',
  denied: 'Denied',
  partial: 'Partial',
  sent: 'Sent',
  draft: 'Draft',
  compressed: 'Compressed',
  pdf: 'PDF',
  image: 'Image',
  text: 'Text',
  unknown: 'Unknown',
};

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
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium leading-none ${style}`}>
      {STATUS_LABELS[status] || formatLabel(status || 'pending')}
    </span>
  );
}

export function actionButtonClasses(variant = 'secondary', className = '') {
  const variants = {
    primary: 'border border-accent bg-accent text-background shadow-[0_0_18px_rgba(108,138,255,0.22)] hover:bg-accent-hover',
    secondary: 'border border-border bg-background/70 text-text-dim hover:border-accent/50 hover:bg-surface-alt hover:text-text',
    download: 'border border-info/45 bg-info/10 text-info hover:border-info/70 hover:bg-info/15',
    danger: 'border border-danger/45 bg-danger/10 text-danger hover:border-danger/70 hover:bg-danger/15',
    'danger-solid': 'border border-danger bg-danger text-background hover:opacity-90',
    plain: 'border border-transparent text-text-dim hover:bg-surface-alt hover:text-text',
  };
  return [
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant] || variants.secondary,
    className,
  ].filter(Boolean).join(' ');
}

export function ActionButton({ variant = 'secondary', className = '', type = 'button', children, ...props }) {
  return (
    <button type={type} className={actionButtonClasses(variant, className)} {...props}>
      {children}
    </button>
  );
}

function helpTipPositionClass(align) {
  if (align === 'center') return 'left-1/2 -translate-x-1/2';
  if (align === 'right') return 'right-0';
  return 'left-0';
}

export function HelpTip({ id, label = 'More information', align = 'left', children, className = '' }) {
  const generatedId = useId();
  const tooltipId = id || generatedId;
  const positionClass = helpTipPositionClass(align);
  return (
    <span className={['group/help relative inline-flex shrink-0', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
        className="grid h-6 w-6 place-items-center rounded-md text-text-dim transition-colors hover:bg-surface-alt hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute top-7 z-30 hidden w-[min(17rem,calc(100vw-3rem))] rounded-md border border-border bg-[var(--color-surface-alt)] px-3 py-2 text-xs font-normal leading-relaxed text-text shadow-elevated group-hover/help:block group-focus-within/help:block ${positionClass}`}
      >
        {children}
      </span>
    </span>
  );
}

export function Panel({ title, eyebrow, action, help, helpLabel, children }) {
  return (
    <section className="min-w-0 rounded-md border border-border bg-surface/75 p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-semibold text-text-dim">{eyebrow}</p>}
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-lg font-bold">{title}</h3>
            {help && <HelpTip align="center" label={helpLabel || `${title} help`}>{help}</HelpTip>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value, detail }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="text-xs font-medium text-text-dim">{label}</p>
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
    'Desired Outcomes',
    ...((packet.desired_outcomes || []).length
      ? (packet.desired_outcomes || []).map((outcome) => `- ${outcome}`)
      : ['No desired outcome entered.']),
    '',
    'What USDWatch Sees',
    packet.what_usdwatch_sees || 'Run a Case Read to generate this section.',
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
