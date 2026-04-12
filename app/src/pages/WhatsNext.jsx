export default function WhatsNext() {
  return (
    <div className="max-w-3xl mx-auto py-8 sm:py-14 px-2 space-y-12 animate-fade-up">

      {/* Headline */}
      <section className="space-y-5">
        <h2 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight">
          My son asked me to do something.
        </h2>
        <p className="text-[15px] leading-relaxed text-text/90">
          He's six. He doesn't fully understand the system that failed him, but
          he knows it did. And he asked me to make sure it doesn't happen to
          other kids.
        </p>
        <p className="text-[15px] leading-relaxed text-text/90">
          I sit on the board of two technology companies —{' '}
          <strong>Elevate.Cloud</strong> and <strong>Arcflare.ai</strong> —
          alongside people who build complex enterprise systems for a living.
          AI platforms, cloud infrastructure, data pipelines that Fortune 500
          companies depend on. So I called them and said: help me build
          something that gives every parent what we had to build from scratch.
        </p>
        <p className="text-lg sm:text-xl text-accent font-semibold leading-snug">
          They said yes.
        </p>
      </section>

      {/* What we're building */}
      <section className="space-y-5">
        <h3 className="text-lg font-bold tracking-tight">
          What we're building — and giving away for free
        </h3>
        <div className="text-[15px] leading-relaxed text-text/90 space-y-5">
          <p>
            The Case Command Center is becoming a platform any parent can use.
            The same people who architect enterprise AI systems are pointing
            that firepower at the bureaucracies that count on you not having
            it. You tell it what happened. It goes to work.
          </p>
          <p>
            It uses <strong>semantic search</strong> to comb through public
            records, school board minutes, policy manuals, and incident reports
            — the stuff that's technically public but practically buried. It
            builds <strong>profiles</strong> of the administrators, board
            members, and officials involved in your case so you can see who
            they are, what they've said, and where the contradictions live. It{' '}
            <strong>validates facts</strong> by cross-referencing what you were
            told against what the policy actually says, what the law actually
            requires, and what the records actually show. It{' '}
            <strong>maps connections</strong> — the organizational
            relationships, the contractual obligations, the patterns of
            deflection that a human would spend weeks untangling.
          </p>
          <p>
            And then it hands your attorney a case file that would've taken
            them 40 billable hours to assemble. For free.
          </p>
        </div>
      </section>

      {/* The ask */}
      <section className="border-t border-border pt-10 space-y-4">
        <p className="text-[15px] leading-relaxed text-text/90">
          A father, a team of engineers, and two companies that decided this
          matters more than the next SaaS dashboard. That's who's building this.
        </p>
        <p className="text-[15px] leading-relaxed text-text/90">
          This tool will be free. Not freemium. Not "free with a catch." Free —
          because the system is already stacked against families and adding a
          paywall to justice is the last thing anyone needs.
        </p>
        <p className="text-base font-semibold text-accent">
          If you're a parent fighting the same fight — you're not alone.
          And soon, you won't be unarmed either.
        </p>
      </section>

    </div>
  );
}
