export default function WhatsNext() {
  return (
    <div className="max-w-3xl mx-auto py-8 sm:py-14 px-2 space-y-12">

      {/* Headline */}
      <section className="space-y-4">
        <h2 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight">
          This started because a 6-year-old was assaulted and nobody was held
          accountable.
        </h2>
        <p className="text-lg sm:text-xl text-accent font-semibold leading-snug">
          It's going to end with every parent having the tools to fight back.
        </p>
      </section>

      {/* The story */}
      <section className="space-y-5 text-[15px] leading-relaxed text-text/90">
        <p>
          My son Liam was assaulted in an after-school program that we were led
          to believe operated under our school district's safety standards. We
          trusted the marketing. We trusted the lease. We trusted a system that,
          at every level, told us our kids were in good hands.
        </p>
        <p>
          When we tried to get answers, we hit a wall that every parent in this
          situation hits. The district said it wasn't their program. The program
          said it followed its own policies. The administrators circled up,
          lawyered up, and waited for us to go away. That's the playbook — make
          it so exhausting, so expensive, so bureaucratically impenetrable that
          families just give up. Most of them do. Not because they want to, but
          because they have to. They can't afford the attorneys. They can't take
          the time off work. They don't know where to look or what questions to
          ask. And the institutions counting on that silence know it.
        </p>
        <p>
          I happen to be a technologist. So instead of giving up, I built this
          — the Case Command Center you're looking at right now. It started as a
          way to organize our own evidence, map the relationships, and pressure-test
          the legal arguments. And somewhere along the way I realized: every
          parent fighting a school district, a county program, a public
          institution that failed their child — they need this too. And they
          shouldn't have to build it themselves.
        </p>
      </section>

      {/* What we're building */}
      <section className="space-y-5">
        <h3 className="text-lg font-bold tracking-tight">
          What we're building — and giving away for free
        </h3>
        <div className="text-[15px] leading-relaxed text-text/90 space-y-5">
          <p>
            We're turning the Case Command Center into a platform that any
            parent can use. You tell it what happened. It goes to work.
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
          I'm building this in Liam's name. He's six. He doesn't understand
          why the adults who were supposed to protect him didn't. He doesn't
          understand why the people responsible won't say they're sorry. But
          he told me he wants to make sure it doesn't happen to other kids.
          So that's what we're doing.
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
