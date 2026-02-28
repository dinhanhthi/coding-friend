import Container from "@/components/ui/Container";

const tools = [
  {
    id: "plugin",
    name: "Plugin",
    subtitle: "/cf-* skills",
    tagline: "Claude Code Plugin",
    description:
      "The core — skills, agents, hooks, and slash commands that enforce disciplined workflows inside Claude Code.",
    color: "violet",
    isPrincipal: true,
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
        />
      </svg>
    ),
    href: "/docs/getting-started/installation/",
  },
  {
    id: "cli",
    name: "CLI",
    subtitle: "cf command",
    tagline: "coding-friend-cli",
    description:
      "Install and manage the plugin, initialize projects, set up statusline, and run the learn host — all from one binary.",
    color: "sky",
    isPrincipal: false,
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
        />
      </svg>
    ),
    href: "/docs/cli/overview/",
  },
  {
    id: "learn-host",
    name: "Learn Host",
    subtitle: "cf host",
    tagline: "Knowledge Website",
    description:
      "Turn your /cf-learn docs into a searchable static website. Host your knowledge base locally or deploy it anywhere.",
    color: "emerald",
    isPrincipal: false,
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.966 8.966 0 00-6 2.292m0-14.25v14.25"
        />
      </svg>
    ),
    href: "/docs/cli/cf-host/",
  },
  {
    id: "learn-mcp",
    name: "Learn MCP",
    subtitle: "cf mcp",
    tagline: "MCP Knowledge Server",
    description:
      "Expose your /cf-learn docs as an MCP server — feed your knowledge base directly into any LLM client that supports MCP (e.g. ChatGPT, claude.ai,...).",
    color: "orange",
    isPrincipal: false,
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
        />
      </svg>
    ),
    href: "/docs/cli/cf-mcp/",
  },
];

const colorMap: Record<
  string,
  { border: string; bg: string; text: string; badge: string; glow: string }
> = {
  violet: {
    border: "border-violet-500/50",
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    badge: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    glow: "shadow-violet-500/20",
  },
  sky: {
    border: "border-sky-500/40",
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    badge: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    glow: "shadow-sky-500/10",
  },
  emerald: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    glow: "shadow-emerald-500/10",
  },
  orange: {
    border: "border-orange-500/40",
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    badge: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    glow: "shadow-orange-500/10",
  },
};

function ToolCard({ tool }: { tool: (typeof tools)[0] }) {
  const c = colorMap[tool.color];
  return (
    <a href={tool.href} className="group relative cursor-pointer">
      {tool.isPrincipal && (
        <span className="absolute -top-px left-4 z-10 -translate-y-1/2 rounded-full border border-yellow-400/50 bg-yellow-400/15 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-yellow-300 uppercase backdrop-blur-sm">
          Principal
        </span>
      )}
      <div
        className={`flex h-full flex-col gap-3 rounded-xl border p-5 transition-all duration-200 hover:shadow-lg ${
          tool.isPrincipal
            ? `${c.border} bg-navy-950/80 hover:shadow-violet-500/20 ring-1 ring-violet-500/20`
            : `border-[#a0a0a03a] bg-navy-950/40 hover:${c.border} hover:${c.glow}`
        }`}
      >

      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-lg p-2 ${c.bg}`}>
          <span className={c.text}>{tool.icon}</span>
        </div>
        <span
          className={`self-start rounded-full border px-2.5 py-0.5 text-xs font-mono font-medium ${c.badge}`}
        >
          {tool.subtitle}
        </span>
      </div>

      <div>
        <h3 className="text-base font-semibold text-white">{tool.name}</h3>
        <p className={`text-xs font-medium ${c.text}`}>{tool.tagline}</p>
      </div>

      <p className="text-sm leading-relaxed text-slate-400">
        {tool.description}
      </p>
      </div>
    </a>
  );
}

const learnFlow = [
  { label: "/cf-learn", color: "text-violet-400", desc: "Capture knowledge" },
  { label: "cf host", color: "text-emerald-400", desc: "Browse as website" },
  { label: "cf mcp", color: "text-orange-400", desc: "Feed into any LLM" },
];

export default function EcosystemSection() {
  return (
    <section id="ecosystem" className="py-20">
      <Container>
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white">The Ecosystem</h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            Four tools, one cohesive workflow. The plugin is the heart — the
            rest amplify what you build.
          </p>
        </div>

        {/* Tool cards grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>

        {/* Learn flow diagram */}
        <div className="mt-12">
          <p className="mb-5 text-center text-sm font-medium tracking-wide text-slate-400 uppercase">
            The <span className="font-mono">/cf-learn</span> pipeline
          </p>
          <div className="mx-auto flex max-w-xl flex-col items-center sm:flex-row sm:justify-center">
            {learnFlow.map((step, i) => (
              <div key={step.label} className="contents">
                <div className="flex flex-col items-center gap-1 rounded-xl border border-[#a0a0a03a] bg-navy-950/50 px-5 py-3 text-center">
                  <code className={`!text-sm font-semibold !border-none ${step.color}`}>
                    {step.label}
                  </code>
                  <span className="text-xs text-slate-400">{step.desc}</span>
                </div>
                {i < learnFlow.length - 1 && (
                  <svg
                    className="h-4 w-4 shrink-0 rotate-90 text-slate-600 my-2 sm:my-0 sm:mx-3 sm:rotate-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
