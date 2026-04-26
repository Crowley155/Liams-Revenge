function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-text-dim">{title}</h3>
      {children}
    </section>
  );
}

function Pill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-dim">
      {children}
    </span>
  );
}

export default function EvaluationResults({ evaluation }) {
  const result = evaluation?.result;

  if (!evaluation) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5 text-sm text-text-dim">
        No evaluation has run for this case yet.
      </div>
    );
  }

  if (evaluation.status !== 'complete' || !result) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Evaluation {evaluation.status}</h3>
          <Pill>{evaluation.model_tier}</Pill>
        </div>
        <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
          <div className="h-full w-2/3 bg-accent animate-pulse" />
        </div>
        {evaluation.error && <p className="text-sm text-red-300">{evaluation.error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{result.evidence_strength} evidence</Pill>
          <Pill>{Math.round((result.confidence || 0) * 100)}% confidence</Pill>
          <Pill>{evaluation.model_tier}</Pill>
        </div>
        <p className="text-base leading-relaxed text-text">{result.executive_summary}</p>
      </div>

      <Section title="Issue Areas">
        <div className="grid gap-3 md:grid-cols-2">
          {result.issue_areas?.map((issue) => (
            <article key={`${issue.area}-${issue.severity}`} className="bg-surface border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-semibold leading-snug">{issue.area}</h4>
                <Pill>{issue.severity}</Pill>
              </div>
              <p className="text-sm leading-relaxed text-text-dim">{issue.why_it_matters}</p>
              <div className="flex flex-wrap gap-2">
                {issue.policy_refs?.map((ref) => <Pill key={ref}>{ref}</Pill>)}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Timeline">
        <div className="space-y-3">
          {result.timeline?.length ? result.timeline.map((event) => (
            <article key={`${event.date}-${event.label}`} className="grid gap-2 border-l-2 border-accent/50 pl-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{event.label}</span>
                {event.date && <Pill>{event.date}</Pill>}
              </div>
              <p className="text-sm leading-relaxed text-text-dim">{event.detail}</p>
            </article>
          )) : (
            <p className="text-sm text-text-dim">Timeline needs dated documents or incident details.</p>
          )}
        </div>
      </Section>

      <Section title="Evidence Gaps">
        <div className="grid gap-3 md:grid-cols-2">
          {result.gaps?.map((gap) => (
            <article key={gap.gap} className="bg-surface border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-semibold">{gap.gap}</h4>
                <Pill>{gap.priority}</Pill>
              </div>
              <p className="text-sm text-text-dim">{gap.why_it_matters}</p>
              <p className="text-sm text-accent">{gap.suggested_source}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Recommended Records">
        <div className="space-y-3">
          {result.recommended_records?.map((record) => (
            <article key={record.title} className="bg-surface border border-border rounded-lg p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold">{record.title}</h4>
                <Pill>{record.priority}</Pill>
                {record.record_type && <Pill>{record.record_type}</Pill>}
              </div>
              <p className="text-sm text-text-dim">{record.reason}</p>
              <p className="text-sm leading-relaxed text-text/90">{record.request_language}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Next Steps">
        <ol className="space-y-2">
          {result.next_steps?.map((step) => (
            <li key={step} className="bg-surface border border-border rounded-lg px-4 py-3 text-sm text-text">
              {step}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
