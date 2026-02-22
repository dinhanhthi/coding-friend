import Container from "@/components/ui/Container";

interface Feature {
  command: string;
  title: string;
  description: string;
}

const statuslineSegments = [
  { label: "CF version", example: "cf v1.6.0", color: "text-blue-400" },
  { label: "Project", example: "coding-friend", color: "text-orange-400" },
  { label: "Model", example: "Opus 4.6", color: "text-cyan-400" },
  {
    label: "Git branch",
    example: (
      <>
        <span className="text-green-400">⎇</span>main
      </>
    ),
    color: "text-green-400",
  },
  {
    label: "Usage → Reset",
    example: "19% → 12:59",
    color: "text-violet-300",
  },
];

const slashCommands: Feature[] = [
  {
    command: "/cf-plan",
    title: "Plan",
    description:
      "Brainstorm and create implementation plans with structured exploration",
  },
  {
    command: "/cf-fix",
    title: "Fix",
    description:
      "Quick bug fix workflow with problem verification and approach confirmation",
  },
  {
    command: "/cf-ask",
    title: "Ask",
    description: "Quick Q&A about your codebase with persistent memory",
  },
  {
    command: "/cf-optimize",
    title: "Optimize",
    description: "Structured optimization with before/after measurement",
  },
  {
    command: "/cf-review",
    title: "Review",
    description: "Multi-layer code review in a forked subagent",
  },
  {
    command: "/cf-commit",
    title: "Commit",
    description: "Smart conventional commits with diff analysis",
  },
  {
    command: "/cf-ship",
    title: "Ship",
    description: "Verify, commit, push, and create PR in one command",
  },
  {
    command: "/cf-remember",
    title: "Remember",
    description: "Capture project knowledge for AI memory across sessions",
  },
  {
    command: "/cf-learn",
    title: "Learn",
    description: "Extract human learning docs from vibe coding sessions",
  },
  {
    command: "/cf-research",
    title: "Research",
    description: "In-depth research with web search and parallel subagents",
  },
];

const autoSkills: Feature[] = [
  {
    command: "cf-tdd",
    title: "TDD Workflow",
    description: "Enforces test-driven development: RED, GREEN, REFACTOR",
  },
  {
    command: "cf-sys-debug",
    title: "Systematic Debug",
    description: "4-phase debugging methodology for systematic problem solving",
  },
  {
    command: "cf-code-review",
    title: "Code Review",
    description: "Multi-layer review checklist automatically applied",
  },
  {
    command: "cf-verification",
    title: "Verification Gate",
    description: "Ensures tests pass before claiming work is done",
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div className="group bg-navy-950/50 cursor-pointer rounded-xl border border-[#a0a0a05d] p-5 transition-all duration-200 hover:border-violet-400/50 hover:shadow-lg">
      <code className="rounded-full border border-[#a0a0a05d] px-2.5 py-1 text-sm font-medium whitespace-nowrap text-violet-400">
        {feature.command}
      </code>
      <h3 className="mt-3 text-base font-semibold whitespace-nowrap text-white">
        {feature.title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
        {feature.description}
      </p>
    </div>
  );
}

export default function Features() {
  return (
    <section id="features" className="bg-navy-950/30 py-12">
      <Container>
        {/* Statusline */}
        <Statusline />

        {/* Slash commands */}
        <SlashCommands />

        {/* Auto-invoked */}
        <AutoInvoked />
      </Container>
    </section>
  );
}

const AutoInvoked = () => {
  return (
    <div className="flex flex-col gap-8 py-12">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white">Auto-Invoked Skills</h2>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
          These skills activate automatically when relevant. No slash needed.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {autoSkills.map((f) => (
          <FeatureCard key={f.command} feature={f} />
        ))}
      </div>
    </div>
  );
};

const SlashCommands = () => {
  return (
    <div className="flex flex-col gap-8 py-12">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white">
          <span className="font-mono">/slash</span> Commands
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
          Manual triggering with natural language. Coding Friend handles the
          rest.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {slashCommands.map((f) => (
          <FeatureCard key={f.command} feature={f} />
        ))}
      </div>
    </div>
  );
};

const Statusline = () => {
  return (
    <div className="flex flex-col gap-8 py-12">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white">Smart Statusline</h2>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
          Always know what&apos;s happening. Your terminal statusline, upgraded
          with real-time project context.
        </p>
      </div>

      <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-6">
        {/* Glow backdrop */}
        <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-linear-to-br from-violet-600/20 via-sky-500/10 to-emerald-500/20 opacity-60 blur-2xl" />

        {/* Terminal mockup */}
        <div className="relative w-full overflow-hidden rounded-2xl border border-[#a0a0a05d] bg-[#1e1e2e] shadow-2xl shadow-violet-500/10 sm:scale-100">
          {/* Title bar */}
          <div className="mb-1 flex items-center gap-2 px-3 py-2">
            <span className="h-3 w-3 rounded-full bg-red-500/80" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <span className="h-3 w-3 rounded-full bg-green-500/80" />
            <span className="ml-3 font-mono text-xs text-slate-500">
              claude — coding-friend
            </span>
          </div>

          {/* Terminal content */}
          <div className="rounded-lg bg-[#1a1b26] px-5 py-4 font-mono text-sm leading-relaxed select-none">
            {/* Prompt line */}
            <div className="flex justify-between">
              <span>
                <span className="font-bold text-cyan-400">➜</span>{" "}
                <span className="font-bold text-white">claude</span>
              </span>
              <span className="text-blue-400">[12:47:44]</span>
            </div>

            {/* Blank line */}
            <div className="h-3" />

            {/* ASCII mascot + info */}
            <pre className="text-sm leading-snug">
              <span className="text-violet-400">{"    ✻\n"}</span>
              <span className="text-violet-400">{"    |\n"}</span>
              <span className="text-violet-400">{"   ▟█▙"}</span>
              {"     "}
              <span className="font-bold text-white">Claude Code</span>
              {" v2.1.50\n"}
              <span className="text-orange-400">{" ▐▛███▜▌"}</span>
              {"   "}
              <span className="text-slate-400">Opus 4.6 · Claude Max</span>
              {"\n"}
              <span className="text-orange-400">{"▝▜█████▛▘"}</span>
              {"  "}
              <span className="text-slate-400">~/git/coding-friend</span>
              {"\n"}
              <span className="text-orange-400">{"  ▘▘ ▝▝"}</span>
            </pre>

            {/* Hook error */}
            <div className="mt-1 ml-4 text-slate-400">
              <span className="text-slate-600">⎿</span>
              {"  "}SessionStart:startup hook error
            </div>

            {/* Separator */}
            <div className="my-3 border-t border-slate-700/60" />

            {/* Input prompt */}
            <div className="text-white">
              <span className="font-bold text-white">❯</span>{" "}
              <span className="text-slate-400">
                Try &quot;how do I log an error?&quot;
              </span>
            </div>

            {/* Separator */}
            <div className="my-3 border-t border-slate-700/60" />

            {/* Statusline */}
            <div className="flex flex-wrap items-center gap-0 gap-y-2 text-sm">
              <span className="whitespace-nowrap text-blue-400">cf v1.6.0</span>
              <span className="mx-2 text-slate-600">│</span>
              <span className="whitespace-nowrap text-orange-400">
                coding-friend
              </span>
              <span className="mx-2 text-slate-600">│</span>
              <span className="whitespace-nowrap text-cyan-400">Opus 4.6</span>
              <span className="mx-2 text-slate-600">│</span>
              <span className="whitespace-nowrap text-green-400">⎇ main</span>
              <span className="mx-2 text-slate-600">│</span>
              <span className="whitespace-nowrap text-violet-400">
                19% → 12:59
              </span>
            </div>
          </div>
        </div>

        {/* Segment labels */}
        <div className="flex flex-wrap justify-center gap-3">
          {statuslineSegments.map((seg) => (
            <div
              key={seg.label}
              className="bg-navy-950/80 flex items-center gap-2 rounded-lg border border-[#a0a0a05d] px-3 py-2"
            >
              <span className={`font-mono text-sm font-semibold ${seg.color}`}>
                {seg.example}
              </span>
              <span className="text-sm text-slate-500">{seg.label}</span>
            </div>
          ))}
        </div>

        {/* Setup hint */}
        <p className="text-center text-slate-500">
          Run{" "}
          <code className="rounded border border-[#a0a0a05d] px-2 py-0.5 text-xs text-violet-400">
            cf statusline
          </code>{" "}
          to set up in seconds.
        </p>
      </div>
    </div>
  );
};
