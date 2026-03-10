"use client";

import { useEffect, useRef, useState } from "react";
import Container from "@/components/ui/Container";

/* ────────────────────────────────────────────────────────────
   DATA MODEL
   ──────────────────────────────────────────────────────────── */

interface FlowNode {
  id: string;
  label: string;
  description: string;
}

interface SideNode {
  id: string;
  label: string;
  description: string;
  parentId: string; // which main node it attaches to
  extraParents?: string[]; // additional main nodes it connects to
  kind: "auto" | "agent";
}

const mainNodes: FlowNode[] = [
  {
    id: "plan",
    label: "/cf-plan",
    description:
      "Brainstorm your approach. Explores the codebase, identifies patterns, and writes a structured plan.",
  },
  {
    id: "implement",
    label: "cf-tdd",
    description:
      "TDD workflow enforced. Every feature starts with a failing test, then implementation, then refactor.",
  },
  {
    id: "review",
    label: "/cf-review",
    description:
      "Multi-layer code review in a separate subagent. Checks security, performance, style, and coverage.",
  },
  {
    id: "commit",
    label: "/cf-commit",
    description:
      "Smart conventional commit. Analyzes staged changes and writes a meaningful commit message.",
  },
  {
    id: "ship",
    label: "/cf-ship",
    description:
      "One command to verify, commit, push, and create a pull request. Smart conventional commits included.",
  },
];

const sideNodes: SideNode[] = [
  // Agents (sky)
  {
    id: "explorer",
    label: "cf-explorer",
    description: "Fast codebase exploration and analysis (read-only)",
    parentId: "plan",
    extraParents: ["implement"],
    kind: "agent",
  },
  {
    id: "planner",
    label: "cf-planner",
    description: "Task decomposition and approach brainstorming",
    parentId: "plan",
    kind: "agent",
  },
  {
    id: "implementer",
    label: "cf-implementer",
    description: "TDD implementation agent — RED, GREEN, REFACTOR",
    parentId: "implement",
    kind: "agent",
  },
  {
    id: "code-reviewer",
    label: "cf-code-reviewer",
    description: "Multi-layer code review agent",
    parentId: "review",
    kind: "agent",
  },
  {
    id: "writer",
    label: "cf-writer",
    description: "Lightweight doc writer for markdown file generation",
    parentId: "ship",
    kind: "agent",
  },
  // Auto-invoked skills (emerald)
  {
    id: "fix",
    label: "/cf-fix",
    description: "Auto-invoked when bugs are detected at any stage",
    parentId: "implement",
    kind: "auto",
  },
  {
    id: "sys-debug",
    label: "cf-sys-debug",
    description:
      "4-phase debugging — loops with /cf-fix to diagnose and resolve bugs",
    parentId: "implement",
    kind: "auto",
  },
  {
    id: "optimize",
    label: "/cf-optimize",
    description: "Auto-invoked for performance optimization",
    parentId: "review",
    kind: "auto",
  },
  {
    id: "auto-review",
    label: "cf-auto-review",
    description: "Review methodology auto-loaded during code review",
    parentId: "review",
    kind: "auto",
  },
  {
    id: "verification",
    label: "cf-verification",
    description: "Auto-invoked gate — never claims done without tests passing",
    parentId: "commit",
    kind: "auto",
  },
  {
    id: "learn",
    label: "/cf-learn",
    description:
      "Auto-extracts knowledge after substantial work into learning notes",
    parentId: "ship",
    kind: "auto",
  },
];

/* ────────────────────────────────────────────────────────────
   LAYOUT CONSTANTS  (desktop coordinate system)
   ──────────────────────────────────────────────────────────── */

const SVG_W = 960;
const SVG_H = 390;
const MAIN_Y = 178;
const MAIN_X_START = 80;
const MAIN_X_END = SVG_W - 80;
const MAIN_SPACING = (MAIN_X_END - MAIN_X_START) / (mainNodes.length - 1);
const NODE_W = 120;
const NODE_H = 48;
const SIDE_W = 140;
const SIDE_H = 40;

// Rows: agents at y=68, main at y=178, autos at y=290.
// cf-sys-debug sits at y=340 (below fix, linked by a loop).
const AGENT_Y = 68;
const AUTO_Y = 290;
const DEBUG_Y = 348;

// SIDE_W=140, so centers must be ≥ 150px apart to avoid overlap.
const sideAbsolutePos: Record<string, { x: number; y: number }> = {
  // ── Top row: agents (left to right) ──
  explorer: { x: 90, y: AGENT_Y }, //  parent: plan (x=80)
  planner: { x: 250, y: AGENT_Y }, //  parent: plan (x=80)
  implementer: { x: 400, y: AGENT_Y }, // parent: implement (x=280)
  "code-reviewer": { x: 560, y: AGENT_Y }, // parent: review (x=480)
  writer: { x: 830, y: AGENT_Y }, //  parent: ship (x=880)
  // ── Bottom row: auto-invoked (left to right) ──
  fix: { x: 140, y: AUTO_Y }, //  parent: implement (x=280)
  "sys-debug": { x: 140, y: DEBUG_Y }, // loops with fix
  optimize: { x: 370, y: AUTO_Y }, //  parent: review (x=480)
  "auto-review": { x: 540, y: AUTO_Y }, //  parent: review (x=480)
  verification: { x: 710, y: AUTO_Y }, //  parent: commit (x=680)
  learn: { x: 860, y: AUTO_Y }, //  parent: ship (x=880)
};

function getMainPos(index: number): { x: number; y: number } {
  return { x: MAIN_X_START + index * MAIN_SPACING, y: MAIN_Y };
}

function getSidePos(node: SideNode): { x: number; y: number } {
  return (
    sideAbsolutePos[node.id] ?? {
      x: SVG_W / 2,
      y: node.kind === "agent" ? AGENT_Y : AUTO_Y,
    }
  );
}

/* ────────────────────────────────────────────────────────────
   SVG HELPERS
   ──────────────────────────────────────────────────────────── */

function mainPath(i: number): string {
  const a = getMainPos(i);
  const b = getMainPos(i + 1);
  const x1 = a.x + NODE_W / 2 + 4;
  const x2 = b.x - NODE_W / 2 - 4;
  const y = MAIN_Y;
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y} C ${cx} ${y} ${cx} ${y} ${x2} ${y}`;
}

function loopBackPath(): string {
  // Segmented path from commit back to implement, between agent row and main row
  const commitPos = getMainPos(3);
  const implPos = getMainPos(1);
  const x1 = commitPos.x;
  const x2 = implPos.x;
  const yMain = MAIN_Y - NODE_H / 2 - 6; // just above main nodes
  const yMid = (AGENT_Y + SIDE_H / 2 + MAIN_Y - NODE_H / 2) / 2; // midpoint between rows
  return `M ${x1} ${yMain} L ${x1} ${yMid} L ${x2} ${yMid} L ${x2} ${yMain}`;
}

function sidePath(node: SideNode, overrideParentId?: string): string {
  const pid = overrideParentId ?? node.parentId;
  const parentIdx = mainNodes.findIndex((n) => n.id === pid);
  const parent = getMainPos(parentIdx);
  const side = getSidePos(node);
  return `M ${parent.x} ${parent.y} L ${side.x} ${side.y}`;
}

/* ────────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────────── */

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Track container width to scale cards on smaller screens
  useEffect(() => {
    const el = graphRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setScale(Math.min(1, w / SVG_W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesktop]);

  // Determine which nodes are "connected" to the hovered node
  const connectedIds = new Set<string>();
  if (hovered) {
    connectedIds.add(hovered);
    // If hovering a main node, connect its side nodes
    sideNodes.forEach((s) => {
      const allParents = [s.parentId, ...(s.extraParents ?? [])];
      if (allParents.includes(hovered) || s.id === hovered) {
        connectedIds.add(s.id);
        allParents.forEach((p) => connectedIds.add(p));
      }
    });
    // If hovering a side node, connect all its parents
    const sideMatch = sideNodes.find((s) => s.id === hovered);
    if (sideMatch) {
      connectedIds.add(sideMatch.parentId);
      sideMatch.extraParents?.forEach((ep) => connectedIds.add(ep));
    }
    // Main flow neighbors
    const mainIdx = mainNodes.findIndex((n) => n.id === hovered);
    if (mainIdx >= 0) {
      if (mainIdx > 0) connectedIds.add(mainNodes[mainIdx - 1].id);
      if (mainIdx < mainNodes.length - 1)
        connectedIds.add(mainNodes[mainIdx + 1].id);
    }
  }

  const isConnected = (id: string) => !hovered || connectedIds.has(id);
  const isActive = (id: string) => hovered === id;

  // ── Desktop tooltip ──
  const tooltipNode =
    hovered &&
    ([...mainNodes, ...sideNodes].find((n) => n.id === hovered) ?? null);
  const tooltipPos = (() => {
    if (!tooltipNode) return null;
    const mainIdx = mainNodes.findIndex((n) => n.id === tooltipNode.id);
    if (mainIdx >= 0) {
      const pos = getMainPos(mainIdx);
      return { x: pos.x, y: pos.y + NODE_H / 2 + 14 };
    }
    const sn = sideNodes.find((n) => n.id === tooltipNode.id);
    if (sn) {
      const pos = getSidePos(sn);
      const above = pos.y < MAIN_Y || sn.id === "fix";
      return {
        x: pos.x,
        y: above ? pos.y - SIDE_H / 2 - 6 : pos.y + SIDE_H / 2 + 6,
      };
    }
    return null;
  })();

  /* ────── DESKTOP ────── */
  if (isDesktop) {
    return (
      <section id="how-it-works" className="py-20" ref={sectionRef}>
        <Container>
          <div className="mb-6 text-center">
            <h2 className="text-3xl font-bold text-white">
              Workflow in Action
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
              Skills and agents work together automatically. Hover to explore
              connections.
            </p>
          </div>

          {/* Graph container */}
          <div
            ref={graphRef}
            className="relative mx-auto"
            style={{
              maxWidth: `${SVG_W}px`,
              aspectRatio: `${SVG_W} / ${SVG_H}`,
            }}
          >
            {/* SVG connections layer */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              fill="none"
              aria-hidden="true"
            >
              <defs>
                <filter
                  id="glow-v"
                  x="-200%"
                  y="-200%"
                  width="500%"
                  height="500%"
                >
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter
                  id="glow-e"
                  x="-200%"
                  y="-200%"
                  width="500%"
                  height="500%"
                >
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter
                  id="glow-s"
                  x="-200%"
                  y="-200%"
                  width="500%"
                  height="500%"
                >
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter
                  id="glow-y"
                  x="-200%"
                  y="-200%"
                  width="500%"
                  height="500%"
                >
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Arrow marker for main flow connections */}
                <marker
                  id="arrow-main"
                  viewBox="0 0 10 8"
                  refX="9"
                  refY="4"
                  markerWidth="7"
                  markerHeight="5"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 4 L 0 8 z" className="fill-violet-500" />
                </marker>

                {/* Arrow marker for loop-back */}
                <marker
                  id="arrow-loop"
                  viewBox="0 0 10 8"
                  refX="9"
                  refY="4"
                  markerWidth="8"
                  markerHeight="6"
                  orient="auto"
                >
                  <path
                    d="M 0 0 L 10 4 L 0 8 z"
                    className="fill-yellow-400/60"
                  />
                </marker>

                {/* Arrow marker for fix ↔ sys-debug loop */}
                <marker
                  id="arrow-debug"
                  viewBox="0 0 10 8"
                  refX="9"
                  refY="4"
                  markerWidth="7"
                  markerHeight="5"
                  orient="auto"
                >
                  <path
                    d="M 0 0 L 10 4 L 0 8 z"
                    className="fill-yellow-400/60"
                  />
                </marker>
              </defs>

              {/* ── Main flow connections ── */}
              {mainNodes.slice(0, -1).map((_, i) => {
                const d = mainPath(i);
                const fromId = mainNodes[i].id;
                const toId = mainNodes[i + 1].id;
                const dim =
                  hovered &&
                  !connectedIds.has(fromId) &&
                  !connectedIds.has(toId);
                return (
                  <g
                    key={`main-${i}`}
                    className={`transition-opacity duration-300 ${dim ? "opacity-15" : "opacity-100"}`}
                  >
                    {/* Static background */}
                    <path
                      d={d}
                      stroke="currentColor"
                      className="text-slate-600"
                      strokeWidth="2"
                      strokeDasharray="8 5"
                      markerEnd="url(#arrow-main)"
                    />
                    {/* Animated overlay */}
                    <path
                      d={d}
                      stroke="currentColor"
                      className="zigzag-dash-animate text-violet-500"
                      strokeWidth="2.5"
                      strokeDasharray="8 5"
                      strokeLinecap="round"
                    />
                    {/* Traveling dot */}
                    <circle
                      r="3"
                      className="fill-current text-violet-400"
                      filter="url(#glow-v)"
                    >
                      <animateMotion
                        dur="2.5s"
                        repeatCount="indefinite"
                        path={d}
                      />
                    </circle>
                  </g>
                );
              })}

              {/* ── Loop-back arc (commit → implement) ── */}
              <g
                className={`transition-opacity duration-300 ${
                  hovered &&
                  !connectedIds.has("commit") &&
                  !connectedIds.has("implement")
                    ? "opacity-15"
                    : "opacity-100"
                }`}
              >
                <path
                  d={loopBackPath()}
                  stroke="currentColor"
                  className="text-yellow-500/40"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  fill="none"
                  markerEnd="url(#arrow-loop)"
                />
                <path
                  d={loopBackPath()}
                  stroke="currentColor"
                  className="auto-dash-animate text-yellow-400/60"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle
                  r="2.5"
                  className="fill-current text-yellow-300"
                  filter="url(#glow-y)"
                >
                  <animateMotion
                    dur="3.5s"
                    repeatCount="indefinite"
                    path={loopBackPath()}
                  />
                </circle>
                {/* Loop label */}
                <text
                  x={(getMainPos(1).x + getMainPos(3).x) / 2}
                  y={(AGENT_Y + SIDE_H / 2 + MAIN_Y - NODE_H / 2) / 2 - 8}
                  textAnchor="middle"
                  className="fill-yellow-400/80 text-xs font-semibold"
                  fontFamily="monospace"
                >
                  iterate
                </text>
              </g>

              {/* ── Fix ↔ sys-debug loop ── */}
              {(() => {
                const fixPos = getSidePos(
                  sideNodes.find((n) => n.id === "fix")!,
                );
                const dbgPos = getSidePos(
                  sideNodes.find((n) => n.id === "sys-debug")!,
                );
                const dim =
                  hovered &&
                  !connectedIds.has("fix") &&
                  !connectedIds.has("sys-debug");
                // Right-side loop: fix → right → down → sys-debug
                const loopX = fixPos.x + SIDE_W / 2 + 16;
                const dLoop = `M ${fixPos.x + SIDE_W / 2} ${fixPos.y} L ${loopX} ${fixPos.y} L ${loopX} ${dbgPos.y} L ${dbgPos.x + SIDE_W / 2} ${dbgPos.y}`;
                // Left-side return: sys-debug → left → up → fix
                const retX = fixPos.x - SIDE_W / 2 - 16;
                const dReturn = `M ${dbgPos.x - SIDE_W / 2} ${dbgPos.y} L ${retX} ${dbgPos.y} L ${retX} ${fixPos.y} L ${fixPos.x - SIDE_W / 2} ${fixPos.y}`;
                return (
                  <g
                    className={`transition-opacity duration-300 ${dim ? "opacity-10" : "opacity-100"}`}
                  >
                    {/* Down path */}
                    <path
                      d={dLoop}
                      stroke="currentColor"
                      className="text-yellow-500/40"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      fill="none"
                      markerEnd="url(#arrow-debug)"
                    />
                    <path
                      d={dLoop}
                      stroke="currentColor"
                      className="auto-dash-animate text-yellow-400/60"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle
                      r="2.5"
                      className="fill-current text-yellow-300"
                      filter="url(#glow-y)"
                    >
                      <animateMotion
                        dur="2.5s"
                        repeatCount="indefinite"
                        path={dLoop}
                      />
                    </circle>
                    {/* Up return path */}
                    <path
                      d={dReturn}
                      stroke="currentColor"
                      className="text-yellow-500/40"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      fill="none"
                      markerEnd="url(#arrow-debug)"
                    />
                    <path
                      d={dReturn}
                      stroke="currentColor"
                      className="auto-dash-animate text-yellow-400/60"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <circle
                      r="2.5"
                      className="fill-current text-yellow-300"
                      filter="url(#glow-y)"
                    >
                      <animateMotion
                        dur="2.5s"
                        repeatCount="indefinite"
                        path={dReturn}
                      />
                    </circle>
                  </g>
                );
              })()}

              {/* ── Side node connections ── */}
              {sideNodes.flatMap((node) => {
                // sys-debug connects via the loop above, not to parent
                if (node.id === "sys-debug") return [];
                const allParents = [
                  node.parentId,
                  ...(node.extraParents ?? []),
                ];
                const dim = hovered && !connectedIds.has(node.id);
                const isAuto = node.kind === "auto";
                return allParents.map((pid) => {
                  const d = sidePath(node, pid);
                  return (
                    <g
                      key={`side-${node.id}-${pid}`}
                      className={`transition-opacity duration-300 ${dim ? "opacity-10" : "opacity-100"}`}
                    >
                      <path
                        d={d}
                        stroke="currentColor"
                        className={
                          isAuto ? "text-emerald-500/40" : "text-sky-500/40"
                        }
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      <path
                        d={d}
                        stroke="currentColor"
                        className={`auto-dash-animate ${isAuto ? "text-emerald-500/60" : "text-sky-500/50"}`}
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                        strokeLinecap="round"
                      />
                      <circle
                        r="2"
                        className={`fill-current ${isAuto ? "text-emerald-400" : "text-sky-400"}`}
                        filter={isAuto ? "url(#glow-e)" : "url(#glow-s)"}
                      >
                        <animateMotion
                          dur="2s"
                          repeatCount="indefinite"
                          path={d}
                        />
                      </circle>
                    </g>
                  );
                });
              })}
            </svg>

            {/* ── Main flow nodes (HTML) ── */}
            {mainNodes.map((node, i) => {
              const pos = getMainPos(i);
              const w = NODE_W * scale;
              const h = NODE_H * scale;
              return (
                <div
                  key={node.id}
                  className={`absolute z-10 flex items-center justify-center rounded-lg border font-mono transition-all duration-300 select-none ${
                    isActive(node.id)
                      ? "bg-navy-950 border-violet-400 text-violet-300 shadow-lg shadow-violet-500/25"
                      : isConnected(node.id)
                        ? "bg-navy-950 border-violet-500/50 text-violet-400"
                        : "bg-navy-950 border-violet-500/20 text-violet-400/40"
                  }`}
                  style={{
                    width: `${w}px`,
                    height: `${h}px`,
                    fontSize: `${14 * scale}px`,
                    left: `${((pos.x - NODE_W / 2) / SVG_W) * 100}%`,
                    top: `${((pos.y - NODE_H / 2) / SVG_H) * 100}%`,
                  }}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  role="button"
                  tabIndex={0}
                  onFocus={() => setHovered(node.id)}
                  onBlur={() => setHovered(null)}
                  aria-label={node.description}
                >
                  {node.label}
                </div>
              );
            })}

            {/* ── Side nodes (HTML) ── */}
            {sideNodes.map((node) => {
              const pos = getSidePos(node);
              const isAuto = node.kind === "auto";
              const sw = SIDE_W * scale;
              const sh = SIDE_H * scale;
              return (
                <div
                  key={node.id}
                  className={`absolute z-10 flex items-center justify-center rounded-md border-2 font-mono transition-all duration-300 select-none ${
                    isAuto
                      ? isActive(node.id)
                        ? "bg-navy-950 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-500/20"
                        : isConnected(node.id)
                          ? "bg-navy-950 border-dashed border-emerald-500/50 text-emerald-400/90"
                          : "bg-navy-950 border-dashed border-emerald-500/20 text-emerald-400/30"
                      : isActive(node.id)
                        ? "bg-navy-950 border-sky-400 text-sky-300 shadow-lg shadow-sky-500/20"
                        : isConnected(node.id)
                          ? "bg-navy-950 border-sky-500/50 text-sky-400/90"
                          : "bg-navy-950 border-sky-500/20 text-sky-400/30"
                  }`}
                  style={{
                    width: `${sw}px`,
                    height: `${sh}px`,
                    fontSize: `${13 * scale}px`,
                    left: `${((pos.x - SIDE_W / 2) / SVG_W) * 100}%`,
                    top: `${((pos.y - SIDE_H / 2) / SVG_H) * 100}%`,
                  }}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  role="button"
                  tabIndex={0}
                  onFocus={() => setHovered(node.id)}
                  onBlur={() => setHovered(null)}
                  aria-label={node.description}
                >
                  {node.label}
                </div>
              );
            })}

            {/* ── Tooltip ── */}
            {tooltipNode && tooltipPos && (
              <div
                className="bg-navy-950 pointer-events-none absolute z-20 w-56 rounded-lg border border-[#a0a0a01c] px-3 py-2 text-center text-xs leading-relaxed text-slate-300 shadow-xl"
                style={{
                  left: `${(tooltipPos.x / SVG_W) * 100}%`,
                  top: `${(tooltipPos.y / SVG_H) * 100}%`,
                  transform:
                    tooltipPos.y < MAIN_Y || tooltipNode.id === "fix"
                      ? "translate(-50%, -100%)"
                      : "translate(-50%, 0%)",
                }}
              >
                <span
                  className={`font-mono font-semibold ${
                    sideNodes.find((s) => s.id === tooltipNode.id)?.kind ===
                    "auto"
                      ? "text-emerald-400"
                      : sideNodes.find((s) => s.id === tooltipNode.id)?.kind ===
                          "agent"
                        ? "text-sky-400"
                        : "text-violet-400"
                  }`}
                >
                  {tooltipNode.label}
                </span>
                <p className="mt-1">{tooltipNode.description}</p>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" />
              Main flow
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-emerald-500 bg-emerald-500/20" />
              Auto-Invoked
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500/60" />
              Agents
            </span>
          </div>
        </Container>
      </section>
    );
  }

  /* ────── MOBILE ────── */
  return (
    <section id="how-it-works" className="py-20" ref={sectionRef}>
      <Container>
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white">Workflow in Action</h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            Skills and agents work together automatically.
          </p>
        </div>

        {/* Legend */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
            Main flow
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full border border-dashed border-emerald-500 bg-emerald-500/20" />
            Auto-Invoked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-500/60" />
            Agents
          </span>
        </div>

        <div className="relative mx-auto max-w-md">
          {/* Vertical animated line */}
          <svg
            className="pointer-events-none absolute top-0 left-5"
            style={{ width: "2px", height: "100%", marginLeft: "-1px" }}
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

          {/* Step cards */}
          {mainNodes.map((node, i) => {
            const children = sideNodes.filter(
              (s) =>
                s.parentId === node.id ||
                s.extraParents?.includes(node.id),
            );
            const agents = children.filter((c) => c.kind === "agent");
            const autos = children.filter((c) => c.kind === "auto");

            return (
              <div key={node.id} className="relative mb-10 pl-14 last:mb-0">
                {/* Circle */}
                <div className="ring-navy-900/30 absolute left-0 flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white shadow-lg ring-4">
                  {String(i + 1).padStart(2, "0")}
                </div>

                {/* Card */}
                <div className="bg-navy-950/80 rounded-lg border border-[#a0a0a01c] p-4">
                  <h3 className="font-mono text-sm font-semibold text-violet-400">
                    {node.label}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {node.description}
                  </p>

                  {/* Connected nodes */}
                  {(agents.length > 0 || autos.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {agents.map((a) => (
                        <span
                          key={a.id}
                          className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] text-sky-400"
                        >
                          {a.label}
                        </span>
                      ))}
                      {autos.map((a) => (
                        <span
                          key={a.id}
                          className="rounded-md border border-dashed border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400"
                        >
                          {a.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Loop indicator for commit */}
                {node.id === "commit" && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-violet-400/60">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="shrink-0"
                    >
                      <path
                        d="M 2 8 A 5 5 0 1 1 8 12"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <path
                        d="M 6 10 L 8 12 L 6 14"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                    loop back to cf-tdd
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
