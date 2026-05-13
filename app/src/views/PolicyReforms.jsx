import { useState } from 'react';
import DocLink from '../components/DocLink';
import { USD232_POLICY_REFORM_SECTIONS } from '../data/policyReforms';

const SECTIONS = USD232_POLICY_REFORM_SECTIONS.map((section) => ({
  ...section,
  color: `var(${section.colorVar})`,
}));

export default function PolicyReforms() {
  const [activeSection, setActiveSection] = useState('jcprd');
  const [expandedId, setExpandedId] = useState(null);

  const totalReforms = SECTIONS.reduce((sum, s) => sum + s.reforms.length, 0);

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent/70 mb-3">
          Crowley v. USD 232 / JCPRD
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          What We're Asking For
        </h2>
        <p className="text-[15px] leading-[1.8] text-text/80 max-w-2xl text-pretty">
          These aren't radical proposals. They're the policies that should already exist — based
          on the lease both entities signed, the statutes already on the books, and the standards
          every parent was told applied. {totalReforms} specific reforms, grounded in evidence.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`min-h-11 rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeSection === s.id
                ? 'border-current bg-accent/10'
                : 'border-border text-text-dim hover:bg-surface-alt hover:text-text'
            }`}
            style={activeSection === s.id ? { borderColor: s.color, color: s.color } : {}}
          >
            {s.label}
            <span className="ml-2 text-xs opacity-60">({s.reforms.length})</span>
          </button>
        ))}
      </div>

      {SECTIONS.filter((s) => s.id === activeSection).map((section) => (
        <div key={section.id} className="space-y-4">
          <div className="mb-2">
            <h3 className="text-xl font-bold" style={{ color: section.color }}>
              {section.entity} — {section.label}
            </h3>
          </div>

          {section.reforms.map((reform, i) => {
            const key = `${section.id}-${i}`;
            const isExpanded = expandedId === key;
            return (
              <div
                key={key}
                className="bg-surface border border-border rounded-lg overflow-hidden transition-colors hover:border-accent/30"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : key)}
                  className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-surface-alt/50 transition-colors"
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                    style={{ background: `color-mix(in srgb, ${section.color} 15%, transparent)`, color: section.color }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold">{reform.title}</p>
                    <p className="text-xs text-text-dim/70 mt-1">
                      {reform.basisId ? <DocLink id={reform.basisId}>{reform.basis}</DocLink> : reform.basis}
                    </p>
                  </div>
                  <span className="text-text-dim text-xs mt-1 shrink-0">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-0 border-t border-border/50">
                    {typeof reform.description === 'string' ? (
                      <p className="text-[15px] leading-[1.8] text-text/85 mt-4 text-pretty">
                        {reform.description}
                      </p>
                    ) : (
                      <div className="text-[15px] leading-[1.8] text-text/85 mt-4 text-pretty">
                        {reform.description}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="border-t border-border pt-8 mt-8">
        <div
          className="bg-surface-alt border border-border rounded-xl p-6 sm:p-8"
        >
          <p className="text-[15px] leading-[1.8] text-text/85 text-pretty">
            None of these reforms require new legislation. They require the institutions
            to follow the contracts they signed, enforce the policies they wrote, and apply
            the statutes already on the books. Every one of these changes protects the next
            family — not just mine.
          </p>
          <p className="text-base font-medium text-accent mt-4">
            The policies aren't the problem. The problem is that nobody enforced them.
          </p>
        </div>
      </div>
    </div>
  );
}
