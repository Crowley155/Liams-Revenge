import { Link } from 'react-router-dom';

export default function WhatsNext() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-2 py-8 sm:py-14 animate-fade-up">
      <section className="space-y-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">How It Works</p>
        <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          Talk to the Case Advocate. Build a case file. Leave with a plan.
        </h2>
        <p className="max-w-3xl text-base leading-relaxed text-text-dim">
          USDWatch is built for parents trying to make sense of records, emails, meetings, discipline issues, bullying concerns, disability supports, retaliation worries, and unanswered records requests.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/login" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-background hover:bg-accent-hover">
            Start My Case
          </Link>
          <a href="/trust" className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text hover:bg-surface-alt">
            Trust Center
          </a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['1. Draft the story', 'Start in plain English. The Case Advocate organizes draft facts and asks one useful follow-up question at a time.'],
          ['2. Add evidence', 'Use the Evidence Locker for emails, PDFs, screenshots, IEP or 504 documents, incident reports, meeting notes, photos, and agency letters.'],
          ['3. Run a Case Read', 'When you are ready, USDWatch summarizes what it sees, what is missing, what records may help, and what next steps are practical.'],
        ].map(([title, body]) => (
          <article key={title} className="rounded-lg border border-border bg-surface p-5">
            <h3 className="font-bold">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-text-dim">{body}</p>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-surface p-5 sm:p-6">
        <h3 className="text-xl font-bold">Why the base workspace is free</h3>
        <p className="mt-3 text-sm leading-relaxed text-text-dim">
          Parents often need clarity before they know whether to call an attorney, file a records request, ask for a meeting, contact an advocate, or simply organize what they already have. The free workspace is meant to make that first step useful without a credit card.
        </p>
      </section>
    </div>
  );
}
