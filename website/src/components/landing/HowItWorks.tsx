"use client";

import { useEffect, useRef, useState } from "react";
import Container from "@/components/ui/Container";

const steps = [
  {
    number: "01",
    title: "Plan",
    command: "/cf-plan Build a REST API with auth",
    output:
      "Creating implementation plan...\n\nExploring codebase...\nIdentifying patterns...\nDesigning approach...\n\nPlan written to docs/plans/rest-api-auth.md",
    description:
      "Brainstorm your approach. Coding Friend explores the codebase, identifies patterns, and writes a structured plan.",
  },
  {
    number: "02",
    title: "Implement",
    command: "Write the auth middleware",
    output:
      "cf-tdd activated\n\nRED: Writing failing test...\n  auth.test.ts: should reject invalid tokens\n\nGREEN: Implementing...\n  auth.middleware.ts: JWT validation\n\nREFACTOR: Cleaning up...\n  All tests passing (3/3)",
    description:
      "Write code with TDD enforced. Every feature starts with a failing test, then implementation, then refactor.",
  },
  {
    number: "03",
    title: "Review",
    command: "/cf-review src/auth/",
    output:
      "Code Review (forked subagent)\n\nSecurity: No injection vulnerabilities\nPerformance: Token caching recommended\nStyle: Consistent with codebase\nTests: 100% branch coverage\n\n2 suggestions, 0 issues",
    description:
      "Multi-layer code review runs in a separate subagent. Checks security, performance, style, and test coverage.",
  },
  {
    number: "04",
    title: "Ship",
    command: "/cf-ship Add JWT auth middleware",
    output:
      "Verification: All tests passing (12/12)\nCommit: feat(auth): add JWT middleware\nPush: origin/feat/jwt-auth\nPR: #42 created\n\nhttps://github.com/.../pull/42",
    description:
      "One command to verify, commit, push, and create a pull request. Smart conventional commits included.",
  },
  {
    number: "05",
    title: "Learn",
    command: "/cf-learn",
    output:
      "Extracting knowledge...\n\nJWT Authentication Patterns\n  Token validation flow\n  Middleware composition\n  Error handling strategies\n\nSaved to docs/learn/Web_Dev/jwt-auth.md\nHost with: cf host",
    description:
      "Capture what you learned from the session. Generate docs, host as a website, or integrate with other LLM clients.",
  },
];

function renderCommand(command: string) {
  const match = command.match(/^(\/\S+)(\s+(.*))?$/);
  if (match) {
    return (
      <>
        <span className="font-semibold text-violet-400">{match[1]}</span>
        {match[3] && <span className="text-emerald-400"> {match[3]}</span>}
      </>
    );
  }
  return <span className="text-emerald-400">{command}</span>;
}

const STEP_OFFSET = 250; // vertical offset between steps on desktop
const CIRCLE_SIZE = 48; // w-12 h-12 = 48px
const CARD_GAP = 40; // gap between card edge and center column

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  // Desktop detection after mount
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Desktop: deterministic connector paths between circles
  const connectorLineHeight = STEP_OFFSET - CIRCLE_SIZE;
  const connectors = steps.slice(0, -1).map((_, i) => {
    const top = i * STEP_OFFSET + CIRCLE_SIZE; // bottom of circle i
    const h = connectorLineHeight;
    const cx = 60;
    const d = `M ${cx} 0 L ${cx} ${h}`;
    return { d, top, height: h, index: i };
  });

  // Desktop container height
  const containerHeight = (steps.length - 1) * STEP_OFFSET + 400;

  return (
    <section id="how-it-works" className="py-20" ref={sectionRef}>
      <Container>
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold text-white">How The Plugin Works</h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            A disciplined workflow from planning to knowledge capture.
          </p>
        </div>

        <div
          className="relative mx-auto max-w-4xl"
          style={isDesktop ? { minHeight: `${containerHeight}px` } : undefined}
        >
          {/* ── Mobile: Vertical timeline line with animation ── */}
          {!isDesktop && (
            <svg
              className="pointer-events-none absolute top-0 left-5"
              style={{
                width: "2px",
                height: "100%",
                marginLeft: "-1px",
              }}
              preserveAspectRatio="none"
              viewBox="0 0 2 1000"
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <filter
                  id="mobile-glow"
                  x="-200%"
                  y="-10%"
                  width="500%"
                  height="120%"
                >
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Static dashed background */}
              <line
                x1="1"
                y1="0"
                x2="1"
                y2="1000"
                stroke="currentColor"
                className="text-slate-600"
                strokeWidth="2"
                strokeDasharray="8 5"
              />

              {/* Animated flowing dashes */}
              <line
                x1="1"
                y1="0"
                x2="1"
                y2="1000"
                stroke="currentColor"
                className="text-violet-500"
                strokeWidth="2.5"
                strokeDasharray="8 5"
                strokeLinecap="round"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-13"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </line>

              {/* Traveling glow dot */}
              <circle
                cx="1"
                r="5"
                className="fill-current text-violet-400"
                filter="url(#mobile-glow)"
              >
                <animate
                  attributeName="cy"
                  from="0"
                  to="1000"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </circle>
            </svg>
          )}

          {/* ── Desktop: SVG connectors (deterministic positions) ── */}
          {isDesktop &&
            connectors.map((c) => (
              <svg
                key={c.index}
                className="pointer-events-none absolute left-1/2 z-0 overflow-visible"
                style={{
                  top: `${c.top}px`,
                  width: "130px",
                  height: `${c.height}px`,
                  marginLeft: "-65px",
                }}
                viewBox={`0 0 120 ${c.height}`}
                fill="none"
                aria-hidden="true"
              >
                <defs>
                  <filter
                    id={`glow-${c.index}`}
                    x="-100%"
                    y="-100%"
                    width="300%"
                    height="300%"
                  >
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Static dashed background */}
                <path
                  d={c.d}
                  stroke="currentColor"
                  className="text-slate-600"
                  strokeWidth="2"
                  strokeDasharray="8 5"
                  fill="none"
                />

                {/* Animated flowing dashes */}
                <path
                  d={c.d}
                  stroke="currentColor"
                  className="zigzag-dash-animate text-violet-500"
                  strokeWidth="2.5"
                  strokeDasharray="8 5"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Traveling glow dot */}
                <circle
                  r="3.5"
                  className="fill-current text-violet-400"
                  filter={`url(#glow-${c.index})`}
                >
                  <animateMotion
                    dur="2.8s"
                    repeatCount="indefinite"
                    path={c.d}
                  />
                </circle>
              </svg>
            ))}

          {/* ── Desktop: centered circles (deterministic positions) ── */}
          {isDesktop &&
            steps.map((step, i) => (
              <div
                key={`circle-${i}`}
                className="ring-navy-900/30 absolute left-1/2 z-10 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white shadow-lg ring-4"
                style={{ top: `${i * STEP_OFFSET}px` }}
              >
                {step.number}
              </div>
            ))}

          {/* ── Step cards ── */}
          {steps.map((step, i) => {
            const isEven = i % 2 === 0;

            return (
              <div
                key={step.number}
                className={`${
                  isDesktop ? "absolute" : "relative mb-12 pl-14 last:mb-0"
                }`}
                style={
                  isDesktop
                    ? {
                        top: `${i * STEP_OFFSET + CIRCLE_SIZE / 4}px`,
                        left: isEven ? "0" : "auto",
                        right: isEven ? "auto" : "0",
                        width: `calc(50% - ${CARD_GAP}px)`,
                      }
                    : undefined
                }
              >
                {/* Mobile step header (circle + title inline) */}
                {!isDesktop && (
                  <div className="mb-3 flex items-center gap-3">
                    <div className="ring-navy-900/30 absolute left-0 flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white shadow-lg ring-4">
                      {step.number}
                    </div>
                    <h3 className="text-xl font-bold text-white">
                      {step.title}
                    </h3>
                  </div>
                )}

                {/* Desktop title */}
                {isDesktop && (
                  <h3
                    className={`mb-2 text-xl font-bold text-white ${
                      isEven ? "text-right" : "text-left"
                    }`}
                  >
                    {step.title}
                  </h3>
                )}

                <p
                  className={`mb-4 text-sm leading-relaxed text-slate-400 ${
                    isDesktop ? (isEven ? "text-right" : "text-left") : ""
                  }`}
                >
                  {step.description}
                </p>

                {/* Terminal mockup */}
                <div
                  className={`overflow-hidden rounded-lg border border-[#a0a0a01c] shadow-lg ${
                    isDesktop && isEven ? "ml-auto" : ""
                  }`}
                >
                  <div className="bg-navy-950 flex items-center gap-1.5 px-4 py-2.5">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div className="h-3 w-3 rounded-full bg-yellow-400" />
                    <div className="h-3 w-3 rounded-full bg-green-400" />
                    <span className="ml-2 font-mono text-xs text-slate-400">
                      terminal
                    </span>
                  </div>
                  <div className="bg-navy-950 p-4 font-mono text-xs leading-relaxed">
                    <div>
                      <span className="text-slate-500">$ </span>
                      {renderCommand(step.command)}
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap text-slate-300">
                      {step.output}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
