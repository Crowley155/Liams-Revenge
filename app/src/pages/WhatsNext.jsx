export default function WhatsNext() {
  return (
    <div className="max-w-3xl mx-auto py-8 sm:py-14 px-2 space-y-12 animate-fade-up">

      {/* Hero image */}
      <div className="relative -mt-8 mb-2 rounded-2xl overflow-hidden">
        <img
          src="./images/whats-next-hero.png"
          alt=""
          className="w-full h-48 sm:h-64 object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>

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
          I'm a dad who happens to know how to build things. So I spent nights
          and weekends doing what any engineer-parent would do when the system
          tells you to go pound sand: I built a tool that fights back.
        </p>
        <p className="text-[15px] leading-relaxed text-text/90">
          No budget. No team. No venture funding. Just a parent with a laptop,
          Cursor, and the kind of motivation that comes from watching a
          bureaucracy shrug at your kid.
        </p>
      </section>

      {/* What I built */}
      <section className="space-y-5">
        <h3 className="text-lg font-bold tracking-tight">
          What a weekend project looks like when the stakes are real
        </h3>
        <div className="text-[15px] leading-relaxed text-text/90 space-y-5">
          <p>
            The Case Command Center isn't a chatbot and it isn't a wrapper around
            ChatGPT. It's a <strong>multi-pass agentic pipeline</strong> — the
            kind of architecture you'd normally see inside an enterprise
            platform, except I pointed it at the public institutions that failed
            my family.
          </p>
          <p>
            A cheap model runs collection — web search, scraping school board
            minutes, policy manuals, incident reports — and dumps everything into
            a <strong>vector database</strong> for semantic retrieval. A
            reasoning model handles{' '}
            <strong>identity disambiguation</strong>, gating every document
            through an identity anchor so the system knows who it's actually
            looking at (and learns who the target is <em>not</em> through
            negative anchors). A third pass synthesizes the final output with{' '}
            <strong>four-tier confidence scoring</strong> — confirmed, probable,
            uncertain, rejected — so nothing ambiguous makes it into the case
            file.
          </p>
          <p>
            It <strong>maps organizational relationships</strong> — who reports
            to whom, which contracts bind which parties, where the policy says
            one thing and the records say another. It analyzes the{' '}
            <strong>gaps in your evidence</strong> and generates public records
            request letters targeting exactly what's missing. When those records
            come back, you upload them. The system parses, chunks, and
            vector-indexes the new documents, then re-analyzes your case with
            the fresh data folded in.
          </p>
          <p>
            DSPy typed signatures instead of raw prompts. LiteLLM for
            provider-agnostic model routing. Qdrant for semantic deduplication at
            0.92 cosine similarity. Graceful degradation on every external
            service. Human-in-the-loop gates on every enrichment action.
          </p>
          <p>
            All of it running on a $20/month Railway container. The whole thing
            is a feedback loop that hands your attorney a case file that would've
            taken them untold billable hours to assemble. For free.
          </p>
        </div>
      </section>

      {/* The ask */}
      <section className="border-t border-border pt-10 space-y-4">
        <p className="text-[15px] leading-relaxed text-text/90">
          One parent. A weekend project that kept growing because the
          bureaucracy kept stonewalling. That's all this is. And if I can build
          it alone, imagine what happens when other parents — other engineers,
          other attorneys, other people who are tired of being told "that's not
          our department" — start contributing.
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
