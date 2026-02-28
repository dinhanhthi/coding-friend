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

const competitors = [
  { name: "Other tools", config: "Complex setup", learn: "Manual docs", rules: "Rigid rules" },
];

const simplicity = [
  {
    title: "One install, every project",
    description:
      "npm install once. The plugin loads into Claude Code automatically. No per-project configuration required.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: "Plain text skills",
    description:
      "Skills are Markdown files. No DSL to learn. Read them, edit them, share them — they're just text.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    title: "Zero friction workflows",
    description:
      "Type /cf-plan and start. Auto-invoked skills activate in the background — TDD, debugging, verification — without a thought.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Multi-platform out of the box",
    description:
      "Works with Cursor, Windsurf, Copilot, Roo Code, and more. One toolkit, every AI coding tool.",
    comingSoon: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
      </svg>
    ),
  },
];

export default function DifferentiatorSection() {
  return (
    <section id="why-coding-friend" className="bg-navy-950/30 py-20">
      <Container>
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white">
            What Makes It Different
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            Two principles that set Coding Friend apart from every other AI
            workflow tool.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Differentiator 1: Simplicity */}
          <div className="flex flex-col gap-6 rounded-2xl border border-[#a0a0a03a] bg-navy-950/50 p-7">
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
                <h3 className="text-xl font-bold text-white">Radical Simplicity</h3>
                <p className="text-sm text-sky-400">Install once. Start using immediately.</p>
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
                    <p className="flex items-center gap-2 text-sm font-medium text-white">
                      {item.title}
                      {"comingSoon" in item && item.comingSoon && (
                        <span className="rounded-full border border-slate-600 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-slate-500">
                          coming soon
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Differentiator 2: cf-learn */}
          <div className="flex flex-col gap-6 rounded-2xl border border-[#a0a0a03a] bg-navy-950/50 p-7 ring-1 ring-violet-500/10">
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
              them as human-readable docs, so <em className="text-white">you</em> actually understand
              what was built — not just the AI.
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
              <pre className="bg-navy-950 overflow-x-auto !p-4 !pt-0 font-mono text-xs leading-relaxed text-slate-300">
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
                  if (line.includes("→")) {
                    const [before, after] = line.split("→");
                    return (
                      <div key={i} className="text-emerald-400">
                        {before}
                        <span className="text-slate-500">→</span>
                        {after}
                      </div>
                    );
                  }
                  if (line.includes("📄")) {
                    return (
                      <div key={i} className="text-white">
                        {line}
                      </div>
                    );
                  }
                  if (line.includes("├──") || line.includes("└──")) {
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
          </div>
        </div>
      </Container>
    </section>
  );
}
