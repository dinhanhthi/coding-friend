import Link from "next/link";
import Container from "@/components/ui/Container";
import TokenBadge from "@/components/ui/TokenBadge";
import {
  getAllTokenData,
  type Tier,
  type AgentTokenEntry,
} from "@/lib/token-data";

interface AgentMeta {
  name: string;
  title: string;
  description: string;
  usedBy: string[];
}

interface Agent extends AgentMeta {
  model: string;
  tier: Tier;
}

const modelDisplayName: Record<string, string> = {
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
};

const agentMeta: AgentMeta[] = [
  {
    name: "cf-code-reviewer",
    title: "Code Reviewer",
    description:
      "Multi-layer review covering plan alignment, code quality, security (OWASP top 10), and test coverage.",
    usedBy: ["/cf-review", "/cf-ship"],
  },
  {
    name: "cf-explorer",
    title: "Explorer",
    description:
      "Maps project structure, searches files, reads code, and returns structured reports with findings and dependencies.",
    usedBy: ["/cf-plan", "/cf-ask", "/cf-fix"],
  },
  {
    name: "cf-implementer",
    title: "Implementer",
    description:
      "Strict TDD implementation in an isolated context. RED, GREEN, REFACTOR — then reports back.",
    usedBy: ["/cf-plan", "/cf-fix", "/cf-optimize", "cf-tdd"],
  },
  {
    name: "cf-planner",
    title: "Planner",
    description:
      "Designs 2-3 implementation approaches with pros, cons, effort, risk, and a recommended path.",
    usedBy: ["/cf-plan"],
  },
  {
    name: "cf-writer",
    title: "Writer",
    description:
      "Lightweight doc generation for memory files, notes, and straightforward markdown content.",
    usedBy: ["/cf-learn", "/cf-remember", "/cf-scan", "/cf-ask"],
  },
  {
    name: "cf-writer-deep",
    title: "Writer Deep",
    description:
      "Deep reasoning writer for nuanced technical content, complex trade-off analysis, and architecture docs.",
    usedBy: ["/cf-learn"],
  },
];

function enrichAgents(items: AgentMeta[]): Agent[] {
  const data = getAllTokenData();
  const agentsData = data.agents as Record<string, AgentTokenEntry>;
  return items.map((item) => {
    const entry = agentsData[item.name];
    return {
      ...item,
      tier: entry?.tier ?? "low",
      model: modelDisplayName[entry?.model] ?? entry?.model ?? "Unknown",
    };
  });
}

const agents = enrichAgents(agentMeta);

const modelColors: Record<string, string> = {
  Haiku: "text-emerald-400 border-emerald-400/30",
  Sonnet: "text-sky-400 border-sky-400/30",
  Opus: "text-violet-400 border-violet-400/30",
};

function AgentCard({ agent }: { agent: Agent }) {
  const colorClass =
    modelColors[agent.model] ?? "text-slate-400 border-slate-400/30";

  return (
    <Link
      href={`/docs/reference/agents/#${agent.name}`}
      className="group bg-navy-950/50 flex flex-col rounded-xl border border-[#a0a0a05d] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-500/5"
    >
      <div className="flex items-center justify-between">
        <code className="rounded-full border border-[#a0a0a05d] px-2.5 py-1 text-base font-medium whitespace-nowrap text-violet-400">
          {agent.name}
        </code>
        <TokenBadge tier={agent.tier} size="lg" variant="ghost" />
      </div>
      <h3 className="mt-3 text-base font-semibold whitespace-nowrap text-white">
        {agent.title}
      </h3>
      <p className="mt-1.5 flex-1 text-base leading-relaxed text-slate-400">
        {agent.description}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {agent.usedBy.map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-[#a0a0a03d] px-1.5 py-0.5 text-xs text-slate-500"
            >
              {skill}
            </span>
          ))}
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${colorClass}`}
        >
          {agent.model}
        </span>
      </div>
    </Link>
  );
}

export default function Agents() {
  return (
    <section id="agents" className="py-12">
      <Container>
        <div className="flex flex-col gap-8 py-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-[-0.02em] text-white">
              Specialized agents
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
              Skills dispatch work to focused agents, each optimized with the
              right model for their task.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <AgentCard key={a.name} agent={a} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
