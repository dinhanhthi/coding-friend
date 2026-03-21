import Link from "next/link";
import Container from "@/components/ui/Container";
import TokenBadge from "@/components/ui/TokenBadge";
import type { Tier } from "@/lib/token-data";

interface Skill {
  command: string;
  title: string;
  description: string;
  tier: Tier;
}

const slashCommands: Skill[] = [
  {
    command: "/cf-plan",
    title: "Plan",
    description:
      "Brainstorm and create implementation plans with structured exploration",
    tier: "medium",
  },
  {
    command: "/cf-fix",
    title: "Fix",
    description:
      "Quick bug fix workflow with problem verification and approach confirmation",
    tier: "medium",
  },
  {
    command: "/cf-ask",
    title: "Ask",
    description: "Quick Q&A about your codebase with persistent memory",
    tier: "medium",
  },
  {
    command: "/cf-optimize",
    title: "Optimize",
    description: "Structured optimization with before/after measurement",
    tier: "medium",
  },
  {
    command: "/cf-review",
    title: "Review",
    description: "Multi-layer code review in a forked subagent",
    tier: "medium",
  },
  {
    command: "/cf-commit",
    title: "Commit",
    description: "Smart conventional commits with diff analysis",
    tier: "low",
  },
  {
    command: "/cf-ship",
    title: "Ship",
    description: "Verify, commit, push, and create PR in one command",
    tier: "low",
  },
  {
    command: "/cf-scan",
    title: "Scan",
    description:
      "Scan project and bootstrap memory with architecture and conventions",
    tier: "high",
  },
  {
    command: "/cf-remember",
    title: "Remember",
    description: "Capture project knowledge for AI memory across sessions",
    tier: "medium",
  },
  {
    command: "/cf-learn",
    title: "Learn",
    description: "Extract human learning docs from vibe coding sessions",
    tier: "medium",
  },
  {
    command: "/cf-research",
    title: "Research",
    description: "In-depth research with web search and parallel subagents",
    tier: "medium",
  },
  {
    command: "/cf-session",
    title: "Session",
    description:
      "Save current session to docs/sessions/ to resume on another machine",
    tier: "medium",
  },
  {
    command: "/cf-help",
    title: "Help",
    description:
      "Answer questions about Coding Friend — skills, agents, workflows",
    tier: "medium",
  },
];

const autoSkills: Skill[] = [
  {
    command: "cf-tdd",
    title: "TDD Workflow",
    description: "Enforces test-driven development: RED, GREEN, REFACTOR",
    tier: "medium",
  },
  {
    command: "cf-sys-debug",
    title: "Systematic Debug",
    description: "4-phase debugging methodology for systematic problem solving",
    tier: "medium",
  },
  {
    command: "cf-auto-review",
    title: "Code Review",
    description: "Multi-layer review checklist automatically applied",
    tier: "low",
  },
  {
    command: "cf-verification",
    title: "Verification Gate",
    description: "Ensures tests pass before claiming work is done",
    tier: "low",
  },
];

function skillHref(command: string): string {
  const name = command.startsWith("/") ? command.slice(1) : command;
  return `/docs/skills/${name}/`;
}

function SkillCard({ skill }: { skill: Skill }) {
  return (
    <Link
      href={skillHref(skill.command)}
      className="group bg-navy-950/50 cursor-pointer rounded-xl border border-[#a0a0a05d] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-400/50 hover:shadow-lg hover:shadow-violet-500/5"
    >
      <div className="flex items-center justify-between">
        <code className="rounded-full border border-[#a0a0a05d] px-2.5 py-1 text-base font-medium whitespace-nowrap text-violet-400">
          {skill.command}
        </code>
        <TokenBadge tier={skill.tier} size="lg" variant="ghost" />
      </div>
      <h3 className="mt-3 text-base font-semibold whitespace-nowrap text-white">
        {skill.title}
      </h3>
      <p className="mt-1.5 text-base leading-relaxed text-slate-400">
        {skill.description}
      </p>
    </Link>
  );
}

export default function Skills() {
  return (
    <section id="skills" className="py-12">
      <Container>
        {/* Slash commands */}
        <div className="flex flex-col gap-8 py-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-[-0.02em] text-white">
              <span className="font-mono">/slash</span> skills
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
              Manual triggering with natural language. Coding Friend handles the
              rest.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {slashCommands.map((f) => (
              <SkillCard key={f.command} skill={f} />
            ))}
          </div>
        </div>

        {/* Auto-invoked */}
        <div className="flex flex-col gap-8 py-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-[-0.02em] text-white">
              Auto-invoked skills
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
              These skills activate automatically when relevant. No slash
              needed.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {autoSkills.map((f) => (
              <SkillCard key={f.command} skill={f} />
            ))}
          </div>
        </div>

        {/* Custom Guides */}
        <div className="flex flex-col gap-8 py-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-[-0.02em] text-white">
              Custom skill guides
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
              Extend any built-in skill with your own rules. Add steps before,
              after, or throughout any workflow.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-linear-to-br from-emerald-600/10 via-violet-500/10 to-sky-500/10 opacity-60 blur-2xl" />

            <div className="relative overflow-hidden rounded-2xl border border-[#a0a0a05d] bg-[#1e1e2e] shadow-2xl shadow-violet-500/10">
              <div className="flex items-center gap-2 border-b border-slate-700/60 px-4 py-2.5">
                <span className="truncate font-mono text-sm text-slate-500">
                  .coding-friend/skills/cf-commit-custom/SKILL.md
                </span>
              </div>

              <div className="px-5 py-4 font-mono text-base leading-relaxed">
                <div>
                  <span className="font-bold text-emerald-400">## Before</span>
                </div>
                <div className="text-slate-400">
                  - Check branch naming convention
                </div>
                <div className="mt-3">
                  <span className="font-bold text-violet-400">## Rules</span>
                </div>
                <div className="text-slate-400">
                  - Always include ticket number in subject
                </div>
                <div className="mt-3">
                  <span className="font-bold text-orange-400">## After</span>
                </div>
                <div className="text-slate-400">
                  - Run tests if commit type is feat: or fix:
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                section: "## Before",
                desc: "Runs before the builtin workflow starts",
                color: "text-emerald-400",
                borderColor: "border-emerald-400/30",
              },
              {
                section: "## Rules",
                desc: "Additional rules applied throughout",
                color: "text-violet-400",
                borderColor: "border-violet-400/30",
              },
              {
                section: "## After",
                desc: "Runs after the final step completes",
                color: "text-orange-400",
                borderColor: "border-orange-400/30",
              },
            ].map((item, index) => (
              <div
                key={index}
                className={`bg-navy-950/50 rounded-xl border ${item.borderColor} p-4 text-center`}
              >
                <code
                  className={`border-none! text-base! font-bold ${item.color}`}
                >
                  {item.section}
                </code>
                <p className="mt-2 text-base text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-center text-slate-500">
            Create{" "}
            <code className="rounded border border-[#a0a0a05d] px-2 py-0.5 text-sm text-violet-400">
              .coding-friend/skills/&lt;skill-name&gt;-custom/SKILL.md
            </code>{" "}
            to customize any skill.
          </p>
        </div>
      </Container>
    </section>
  );
}
