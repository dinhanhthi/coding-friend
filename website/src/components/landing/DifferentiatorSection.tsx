import Container from "@/components/ui/Container";

const cfLearnExample = `$ /cf-learn JWT Authentication

Extracting knowledge from session...

📄 JWT Authentication Patterns
   ├── Token validation flow
   ├── Middleware composition
   └── Error handling strategies

Saved → docs/learn/Web_Dev/jwt-auth.md

$ cf host          # Browse as website
$ cf mcp           # Feed into any LLM`;

const cfMemoryExample = `$ cf memory status
Tier 1 (SQLite + Hybrid Search)
  Memories: 47  │  Daemon: running
  Index: FTS5 + sqlite-vec (384d)

$ cf memory search "auth middleware"
┌─ 0.94  Auth middleware uses JWT httpOnly
├─ 0.87  CORS fix: missing Origin header
└─ 0.81  Session rotation on refresh

Skills auto-recall relevant memories
before every task via MCP.`;

const simplicity = [
  {
    title: "One install, every project",
    description:
      "npm install once. The plugin loads into Claude Code automatically. No per-project configuration required.",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>
    ),
  },
  {
    title: "Plain text skills",
    description:
      "Skills are Markdown files. No DSL to learn. Read them, edit them, share them — they're just text.",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    ),
  },
  {
    title: "Zero friction workflows",
    description:
      "Type /cf-plan and start. Auto-invoked skills activate in the background — TDD, debugging, verification — without a thought.",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    title: "Multi-platform out of the box",
    description:
      "Works with Cursor, Windsurf, Copilot, Roo Code, and more. One toolkit, every AI coding tool.",
    comingSoon: true,
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3"
        />
      </svg>
    ),
  },
];

const memoryStrengths = [
  {
    title: "3-tier graceful degradation",
    description:
      "SQLite + vectors when available, MiniSearch in-memory as fallback, pure grep as baseline. Always works, even offline.",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25L12 17.25 2.25 12l4.179-2.25m11.142 0L12 7.5"
        />
      </svg>
    ),
  },
  {
    title: "Hybrid search (BM25 + semantic)",
    description:
      "Keyword precision meets semantic understanding. Find memories even when you paraphrase — RRF fusion ranks the best results.",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
    ),
  },
  {
    title: "Auto-capture from skills",
    description:
      "cf-fix, cf-sys-debug, cf-review, and cf-ask automatically store debug episodes, architectural insights, and solutions.",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
        />
      </svg>
    ),
  },
  {
    title: "100% local, markdown source of truth",
    description:
      "No cloud, no API keys. Your memories live as plain markdown files you can read, edit, and version-control.",
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
        />
      </svg>
    ),
  },
];

export default function DifferentiatorSection() {
  return (
    <section id="why-coding-friend" className="bg-navy-950/30 py-20">
      <Container className="max-w-5xl!">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white">
            What Makes It Different
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            Three principles that set Coding Friend apart from every other AI
            workflow tool.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Differentiator 1: Simplicity */}
          <div className="bg-navy-950/50 flex flex-col gap-6 rounded-2xl border border-[#a0a0a03a] p-7">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-500/10 p-2.5">
                <svg
                  className="h-6 w-6 text-sky-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  Radical Simplicity
                </h3>
                <p className="text-sm text-sky-400">
                  Install once. Start using immediately.
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-400">
              Most workflow tools require complex setup or hours of
              configuration. Coding Friend is the opposite — install once, use
              everywhere, with plain text skills you can read and edit anytime.
            </p>

            <div className="flex flex-col gap-3">
              {simplicity.map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 rounded-md bg-sky-500/10 p-1.5 text-sky-400">
                    {item.icon}
                  </div>
                  <div>
                    <p className="mb-1 flex flex-col items-start gap-1 text-sm font-medium text-white md:flex-row md:items-center md:gap-2">
                      {item.title}
                      {"comingSoon" in item && item.comingSoon && (
                        <span className="rounded-full border border-yellow-400/20 px-1.5 py-0.5 text-xs font-medium tracking-wide whitespace-nowrap text-yellow-400">
                          coming soon
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href="/docs/getting-started/installation/"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-sky-400 transition-colors hover:text-sky-300"
            >
              Read more
              <svg
                className="h-4 w-4"
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
            </a>
          </div>

          {/* Differentiator 2: cf-learn */}
          <div className="bg-navy-950/50 flex flex-col gap-6 rounded-2xl border border-[#a0a0a03a] p-7 ring-1 ring-violet-500/10">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-500/10 p-2.5">
                <svg
                  className="h-6 w-6 text-violet-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">/cf-learn</h3>
                <p className="text-sm text-violet-400">
                  Your knowledge, amplified.
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-400">
              Vibe-coding is fast — but you risk learning nothing. Every session
              generates insights you never write down.{" "}
              <span className="font-medium text-white">/cf-learn</span> captures
              them as human-readable docs, so{" "}
              <em className="text-white">you</em> actually understand what was
              built — not just the AI.
            </p>

            {/* Terminal showing cf-learn flow */}
            <div className="overflow-hidden rounded-xl border border-[#a0a0a01c]">
              <div className="bg-navy-950 flex items-center gap-1.5 px-4 py-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                <span className="ml-2 font-mono text-xs text-slate-500">
                  terminal
                </span>
              </div>
              <pre className="bg-navy-950 overflow-x-auto p-4! pt-0! font-mono text-xs leading-relaxed text-slate-300">
                {cfLearnExample.split("\n").map((line, i) => {
                  if (line.startsWith("$")) {
                    const parts = line.split(" ");
                    const cmd = parts.slice(1).join(" ");
                    return (
                      <div key={i}>
                        <span className="text-slate-500">$ </span>
                        <span className="text-violet-400">{cmd}</span>
                      </div>
                    );
                  }
                  if (line.includes("\u2192")) {
                    const [before, after] = line.split("\u2192");
                    return (
                      <div key={i} className="text-emerald-400">
                        {before}
                        <span className="text-slate-500">{"\u2192"}</span>
                        {after}
                      </div>
                    );
                  }
                  if (line.includes("\uD83D\uDCC4")) {
                    return (
                      <div key={i} className="text-white">
                        {line}
                      </div>
                    );
                  }
                  if (
                    line.includes("\u251C\u2500\u2500") ||
                    line.includes("\u2514\u2500\u2500")
                  ) {
                    return (
                      <div key={i} className="text-slate-400">
                        {line}
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="text-slate-500">
                      {line}
                    </div>
                  );
                })}
              </pre>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                "Auto-invoked during sessions",
                "Categorized by topic",
                "Host as website",
                "MCP-ready",
              ].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-xs text-violet-300"
                >
                  {tag}
                </span>
              ))}
            </div>

            <a
              href="/docs/skills/cf-learn/"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 transition-colors hover:text-violet-300"
            >
              Read more
              <svg
                className="h-4 w-4"
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
            </a>
          </div>

          {/* Differentiator 3: CF Memory */}
          <div className="bg-navy-950/50 rounded-2xl border border-[#a0a0a03a] p-7 ring-1 ring-amber-500/10 md:col-span-2">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2.5">
                <svg
                  className="h-6 w-6 text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75m16.5 3.75v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">CF Memory</h3>
                <p className="text-sm text-amber-400">
                  AI that remembers your project.
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Every AI session starts from scratch — repeating the same
              mistakes, forgetting past decisions, losing debug knowledge.{" "}
              <span className="font-medium text-white">CF Memory</span> gives
              your AI persistent, searchable memory across sessions — so it{" "}
              <em className="text-white">learns</em> from your project over
              time.
            </p>

            {/* Two-column content */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left: Terminal */}
              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[#a0a0a01c]">
                <div className="bg-navy-950 flex items-center gap-1.5 px-4 py-2.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                  <span className="ml-2 font-mono text-xs text-slate-500">
                    terminal
                  </span>
                </div>
                <pre className="bg-navy-950 min-h-0 flex-1 overflow-x-auto p-4! pt-0! font-mono text-xs leading-relaxed text-slate-300">
                  {cfMemoryExample.split("\n").map((line, i) => {
                    if (line.startsWith("$")) {
                      const parts = line.split(" ");
                      const cmd = parts.slice(1).join(" ");
                      return (
                        <div key={i}>
                          <span className="text-slate-500">$ </span>
                          <span className="text-amber-400">{cmd}</span>
                        </div>
                      );
                    }
                    if (line.startsWith("Tier")) {
                      return (
                        <div key={i} className="font-semibold text-amber-300">
                          {line}
                        </div>
                      );
                    }
                    if (line.includes("0.9") || line.includes("0.8")) {
                      const scoreMatch = line.match(
                        /([\u250C\u251C\u2514]\u2500\s*)([\d.]+)(\s+)(.*)/,
                      );
                      if (scoreMatch) {
                        return (
                          <div key={i}>
                            <span className="text-slate-600">
                              {scoreMatch[1]}
                            </span>
                            <span className="text-emerald-400">
                              {scoreMatch[2]}
                            </span>
                            <span>{scoreMatch[3]}</span>
                            <span className="text-slate-300">
                              {scoreMatch[4]}
                            </span>
                          </div>
                        );
                      }
                    }
                    if (line.startsWith("Skills")) {
                      return (
                        <div key={i} className="text-slate-500 italic">
                          {line}
                        </div>
                      );
                    }
                    if (line.includes("\u2502")) {
                      return (
                        <div key={i} className="text-slate-400">
                          {line}
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="text-slate-500">
                        {line}
                      </div>
                    );
                  })}
                </pre>
              </div>

              {/* Right: Strength points */}
              <div className="flex flex-col gap-4">
                {memoryStrengths.map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 rounded-md bg-amber-500/10 p-1.5 text-amber-400">
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {item.title}
                      </p>
                      <p className="text-sm text-slate-500">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <a
              href="/docs/cli/cf-memory/"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-amber-400 transition-colors hover:text-amber-300"
            >
              Read more
              <svg
                className="h-4 w-4"
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
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
