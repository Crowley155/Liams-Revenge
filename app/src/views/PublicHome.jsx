import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function PublicHome() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="-mx-4 -mt-6 sm:-mx-6">
      <section className="relative min-h-[72vh] overflow-hidden bg-background">
        <img
          src="/images/hero-briefing.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/88 to-background/35" />
        <div className="relative mx-auto flex min-h-[72vh] max-w-7xl flex-col justify-center px-4 py-16 sm:px-6">
          <div className="max-w-3xl space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/90">
              Free draft case workspace
            </p>
            <div className="space-y-4">
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
                USDWatch
              </h1>
              <p className="max-w-2xl text-base leading-7 text-text/82 sm:text-lg">
                Start with the Case Advocate, organize school records and evidence, and build a private case file before you decide what to do next.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to={isAuthenticated ? '/cases' : '/login'}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 py-3 text-sm font-bold text-background transition-colors hover:bg-accent-hover"
              >
                Start a Case
              </Link>
              <Link
                to="/trust"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background/70 px-5 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-alt"
              >
                Trust Center
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-3">
        <article className="border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-dim">Private workspace</p>
          <p className="mt-3 text-sm leading-6 text-text">
            Free users get one draft or active case assigned to their own account.
          </p>
        </article>
        <article className="border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-dim">Case file</p>
          <p className="mt-3 text-sm leading-6 text-text">
            Evidence strength, missing records, records requests, and recommended next steps live together.
          </p>
        </article>
        <article className="border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-dim">Plain disclosures</p>
          <p className="mt-3 text-sm leading-6 text-text">
            No legal advice, no sale of family case files, and no public posting of private case material.
          </p>
        </article>
      </section>
    </div>
  );
}
