import { useState } from 'react';
import { useCase } from '../data/useCase';
import DocLink from '../components/DocLink';
import OrgDiagram from '../components/OrgDiagram';

const ORG_META = {
  'USD 232': { color: '#6c8aff', label: 'USD 232 — School District' },
  JCPRD: { color: '#ff6b6b', label: 'JCPRD — Johnson County Parks & Rec' },
  Family: { color: '#69db7c', label: 'Family' },
};

const ORG_ORDER = ['USD 232', 'JCPRD', 'Family'];

function Initials({ name, color }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={{ backgroundColor: color + '22', color }}
    >
      {initials}
    </div>
  );
}

function ActorCard({ actor }) {
  const [open, setOpen] = useState(false);
  const orgColor = ORG_META[actor.org]?.color || '#6c8aff';

  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Initials name={actor.name} color={orgColor} />
        <div className="min-w-0">
          <h3 className="font-semibold text-text text-sm">{actor.name}</h3>
          <p className="text-xs text-text-dim">{actor.role}</p>
        </div>
      </div>

      {actor.bio && (
        <p className="text-sm text-text-dim leading-relaxed">{actor.bio}</p>
      )}

      {actor.keyQuotes?.length > 0 && (
        <div>
          <button
            onClick={() => setOpen(!open)}
            className="text-xs font-medium text-accent hover:text-accent-hover flex items-center gap-1"
          >
            <span className="inline-block transition-transform" style={{ transform: open ? 'rotate(90deg)' : '' }}>▸</span>
            {actor.keyQuotes.length} key quote{actor.keyQuotes.length > 1 ? 's' : ''}
          </button>

          {open && (
            <div className="mt-2 space-y-2">
              {actor.keyQuotes.map((q, i) => (
                <div key={i} className="pl-3 border-l-2 border-border">
                  <p className="text-xs italic text-text leading-relaxed">
                    "{q.text}"
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-dim">
                    <span>{q.date}</span>
                    {q.docId && (
                      <DocLink id={q.docId}>
                        {q.docId}
                      </DocLink>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function People() {
  const { actors } = useCase();

  const grouped = ORG_ORDER.map((org) => ({
    org,
    meta: ORG_META[org],
    members: actors.filter((a) => a.org === org),
  })).filter((g) => g.members.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Who's Who</h1>
        <p className="text-text-dim text-sm">
          Every person involved in this case, their role, and what they said on
          the record.
        </p>
      </div>

      <OrgDiagram />

      {grouped.map(({ org, meta, members }) => (
        <section key={org}>
          <h2
            className="text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2"
            style={{ color: meta.color }}
          >
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: meta.color }}
            />
            {meta.label}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((a) => (
              <ActorCard key={a.id} actor={a} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
