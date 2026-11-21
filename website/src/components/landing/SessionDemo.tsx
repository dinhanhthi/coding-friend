"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "./useInView";

type Line =
  | { kind: "prompt"; text: string }
  | { kind: "signal"; skill: string }
  | { kind: "agent"; name: string; text: string }
  | { kind: "out"; text: string; tone?: "ok" | "muted" }
  | { kind: "row"; status: string; text: string };

type Step = { line: Line; adds?: string[]; wait: number };

// One task, end to end, drawn from the real skills: plan, build, review, remember, commit.
const STEPS: Step[] = [
  {
    line: { kind: "prompt", text: "/cf-plan add a dark mode toggle" },
    wait: 1500,
  },
  { line: { kind: "signal", skill: "/cf-plan" }, wait: 700 },
  {
    line: { kind: "agent", name: "cf-explorer", text: "mapped 38 files" },
    wait: 900,
  },
  {
    line: { kind: "out", text: "Plan written to docs/plans/dark-mode/" },
    adds: ["plans/dark-mode/plan.md", "plans/dark-mode/brief.md"],
    wait: 1100,
  },
  {
    line: { kind: "row", status: "✅ DONE", text: "Phase 1: Tokens" },
    wait: 700,
  },
  {
    line: { kind: "row", status: "✅ DONE", text: "Phase 2: Toggle" },
    wait: 900,
  },
  { line: { kind: "signal", skill: "/cf-review" }, wait: 700 },
  {
    line: {
      kind: "out",
      text: "🚨 0 critical  ⚠️ 0 important  💡 1 tip",
      tone: "muted",
    },
    wait: 800,
  },
  {
    line: { kind: "out", text: "Review status: COMPLETE", tone: "ok" },
    wait: 1000,
  },
  { line: { kind: "signal", skill: "/cf-remember" }, wait: 700 },
  {
    line: { kind: "out", text: "Saved docs/memory/features/theme-toggle.md" },
    adds: ["memory/features/theme-toggle.md"],
    wait: 1000,
  },
  {
    line: {
      kind: "out",
      text: "[main 3f2a1c9] feat: add dark mode toggle",
      tone: "ok",
    },
    wait: 3600,
  },
];

const BASE_TREE = ["memory/conventions/naming.md", "plans/auth-flow/plan.md"];

function treeOf(
  paths: string[],
): { depth: number; name: string; path: string }[] {
  const rows: { depth: number; name: string; path: string }[] = [];
  const seen = new Set<string>();
  for (const path of [...paths].sort()) {
    const parts = path.split("/");
    parts.forEach((name, depth) => {
      const key = parts.slice(0, depth + 1).join("/");
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        depth,
        name: depth < parts.length - 1 ? `${name}/` : name,
        path: key,
      });
    });
  }
  return rows;
}

function Signal({ skill }: { skill: string }) {
  return (
    <span className="sd-signal">
      ✨ <b>CODING FRIEND</b> → {skill} activated
    </span>
  );
}

function LineView({ line }: { line: Line }) {
  switch (line.kind) {
    case "prompt":
      return (
        <p className="sd-line sd-line--prompt">
          <span className="sd-caret">›</span>
          <span
            className="sd-typed"
            style={{ "--n": line.text.length } as React.CSSProperties}
          >
            {line.text}
          </span>
        </p>
      );
    case "signal":
      return (
        <p className="sd-line">
          <Signal skill={line.skill} />
        </p>
      );
    case "agent":
      return (
        <p className="sd-line sd-line--muted">
          <span className="sd-agent">{line.name}</span> {line.text}
        </p>
      );
    case "row":
      return (
        <p className="sd-line sd-line--row">
          <span>{line.status}</span>
          <span>{line.text}</span>
        </p>
      );
    default:
      return (
        <p className={`sd-line ${line.tone ? `sd-line--${line.tone}` : ""}`}>
          {line.text}
        </p>
      );
  }
}

/**
 * The hero's looping scene: a coding agent working through one task with Coding Friend, and the project's
 * docs/ folder filling in beside it. Decorative (aria-hidden): the headline and lead say what it shows.
 * Runs only while on screen; with reduced motion it shows the finished session, still.
 */
export default function SessionDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [step, setStep] = useState(0);
  const still = useReducedMotion();
  const count = still ? STEPS.length : step;

  useEffect(() => {
    if (still || !inView) return;
    const wait = step === 0 ? 500 : (STEPS[step - 1]?.wait ?? 0);
    const timer = setTimeout(
      () => setStep((c) => (c >= STEPS.length ? 0 : c + 1)),
      wait,
    );
    return () => clearTimeout(timer);
  }, [step, inView, still]);

  // A narrow window can't fit the whole log: keep the newest line in view, as a terminal does.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [count]);

  const shown = STEPS.slice(0, count);
  const latest = new Set(STEPS[count - 1]?.adds ?? []);
  const files = [...BASE_TREE, ...shown.flatMap((s) => s.adds ?? [])];

  return (
    <div className="session-demo" ref={ref} aria-hidden="true">
      <div className="sd-bar">
        <span className="sd-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="sd-title">~/acme-app — claude</span>
      </div>
      <div className="sd-body">
        <div className="sd-log" ref={logRef}>
          {shown.map((step, index) => (
            <LineView key={`${index}-${step.line.kind}`} line={step.line} />
          ))}
          {count < STEPS.length ? <span className="sd-cursor" /> : null}
        </div>
        <div className="sd-tree">
          <p className="sd-tree__root">docs/</p>
          <ul>
            {treeOf(files).map((row) => (
              <li
                key={row.path}
                className={latest.has(row.path) ? "is-new" : undefined}
                style={{ "--depth": row.depth } as React.CSSProperties}
              >
                {row.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
