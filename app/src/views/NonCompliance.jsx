import { useState } from 'react';
import DocLink from '../components/DocLink';
import SECTIONS from '../../../data/compliance-data.json';

export default function NonCompliance() {
  const [activeSection, setActiveSection] = useState('lease');

  const totalIssues = SECTIONS.reduce(
    (sum, s) => sum + s.rules.filter((r) => r.status === 'not_applied').length,
    0,
  );

  return (
    <div className="space-y-8">
      <div className="relative -mx-4 sm:-mx-6 -mt-6 mb-4 overflow-hidden rounded-b-2xl">
        <img
          src="/images/non-compliance-header.webp"
          alt=""
          className="w-full h-44 sm:h-56 object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-1">Policy & Compliance Review</h2>
        <p className="text-xs text-text-dim mb-2">
          Rules, contracts, and statutes that apply to this situation, compared against what the available evidence shows.
        </p>
        <p className="text-[11px] text-text-dim/70 italic mb-2">
          This analysis reflects one family's reading of publicly available policies, statutes, and records. It is not a legal finding or adjudication.
        </p>
        <div className="flex gap-3 items-center mt-3">
          <span className="text-sm font-medium text-warning">
            {totalIssues} policies appear not applied
          </span>
          <span className="text-xs text-text-dim">across {SECTIONS.length} categories</span>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`min-h-11 rounded-md border px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeSection === s.id
                ? 'border-current bg-accent/10 text-accent'
                : 'border-border text-text-dim hover:bg-surface-alt hover:text-text'
            }`}
            style={activeSection === s.id ? { borderColor: s.color, color: s.color } : {}}
          >
            {s.title}
            <span className="ml-2 text-[10px] opacity-60">
              ({s.rules.filter((r) => r.status === 'not_applied').length})
            </span>
          </button>
        ))}
      </div>

      {/* Active Section Content */}
      {SECTIONS.filter((s) => s.id === activeSection).map((section) => (
        <div key={section.id} className="space-y-4">
          <div className="mb-2">
            <h3 className="text-lg font-bold" style={{ color: section.color }}>
              {section.title}
            </h3>
            <p className="text-xs text-text-dim">{section.subtitle}</p>
          </div>

          {section.rules.map((rule, ri) => (
            <RuleCard key={ri} rule={rule} />
          ))}
        </div>
      ))}

      {/* Summary */}
      <div className="border-t border-border pt-6 mt-8">
        <div className="bg-surface-alt border border-border rounded-lg p-5">
          <h4 className="text-sm font-bold mb-2">What the Records Show</h4>
          <p className="text-sm leading-relaxed text-text-dim">
            Across the lease, KDHE licensing, and district statutes, the available evidence
            shows a consistent pattern: policies and obligations exist, but based on the
            records available to this family, they do not appear to have been applied in this
            instance. Both entities directed the parent to the other party. The policies
            themselves are not ambiguous.
          </p>
        </div>
      </div>
    </div>
  );
}

function StructuredContent({ intro, points }) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed">{intro}</p>
      {points?.length > 0 && (
        <dl className="space-y-2 mt-2">
          {points.map((pt, i) => (
            <div key={i} className="rounded-md border border-border bg-background/40 px-3 py-2">
              <dt className="text-[11px] font-semibold text-text">{pt.label}</dt>
              <dd className="text-xs leading-relaxed text-text-dim mt-0.5">{pt.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function RuleCard({ rule }) {
  const [expanded, setExpanded] = useState(false);
  const hasStructured = rule.requiresIntro || rule.actualIntro;

  return (
    <div
      className="bg-surface border border-border rounded-lg overflow-hidden transition-colors hover:border-accent/30"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-surface-alt/50 transition-colors"
      >
        <StatusIcon status={rule.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{rule.rule}</p>
          <p className="text-[11px] text-text-dim mt-0.5">
            {rule.source}{' '}
            <span className="ml-1 text-accent">
              <DocLink id={rule.sourceId}>{rule.sourceId}</DocLink>
            </span>
          </p>
        </div>
        <span className="text-text-dim text-xs mt-1 shrink-0">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-0 space-y-4 border-t border-border/50">
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-1.5">
                What the rule requires
              </p>
              {hasStructured ? (
                <StructuredContent
                  intro={rule.requiresIntro}
                  points={rule.requiresPoints}
                />
              ) : (
                <p className="text-xs leading-relaxed">{rule.requires}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-warning mb-1.5">
                What the evidence shows
              </p>
              {hasStructured ? (
                <StructuredContent
                  intro={rule.actualIntro}
                  points={rule.actualPoints}
                />
              ) : (
                <p className="text-xs leading-relaxed">{rule.actual}</p>
              )}
            </div>
          </div>
          {rule.evidenceIds?.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-[10px] text-text-dim uppercase tracking-wider self-center mr-1">
                Evidence:
              </span>
              {rule.evidenceIds.map((id) => (
                <DocLink key={id} id={id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'not_applied') {
    return (
      <span className="w-6 h-6 rounded-full bg-warning/15 text-warning flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        &#9675;
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-full bg-yellow-500/15 text-yellow-500 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
      ?
    </span>
  );
}
