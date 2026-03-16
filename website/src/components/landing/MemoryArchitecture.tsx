"use client";

import { useState } from "react";

/* ────────────────────────────────────────────────────────────
   DATA MODEL
   ──────────────────────────────────────────────────────────── */

interface ArchNode {
  id: string;
  label: string;
  tierLabel?: string; // e.g. "Tier 1" — shown above label for tier nodes
  sublabel?: string;
  description: string;
  row: number; // 0=top, 1=middle, 2=tiers, 3=bottom
  col: number; // position within row
}

const archNodes: ArchNode[] = [
  // Row 0: Source
  {
    id: "claude",
    label: "Claude Code",
    sublabel: "Session",
    description:
      "Your AI coding session. Skills like /cf-fix, /cf-ask, and /cf-remember trigger memory operations automatically.",
    row: 0,
    col: 1,
  },
  // Row 1: Routing hub (centered)
  {
    id: "mcp",
    label: "MCP Server",
    sublabel: "stdio",
    description:
      "Central routing hub. Detects the best available backend (SQLite \u2192 Daemon \u2192 Grep) and routes all 6 memory tools directly to it.",
    row: 1,
    col: 1,
  },
  // Row 2: Tier 1 (direct) | Daemon (Tier 2 host) | Tier 3 (direct)
  {
    id: "tier1",
    tierLabel: "Tier 1",
    label: "SQLite",
    sublabel: "FTS5 + vectors",
    description:
      "Full-power search: FTS5 full-text + sqlite-vec semantic vectors, fused with Reciprocal Rank Fusion (RRF). Used directly by MCP server.",
    row: 2,
    col: 0,
  },
  {
    id: "daemon",
    label: "Daemon",
    sublabel: "Hono + UDS",
    description:
      "Background Hono server on Unix Domain Socket. Only used for Tier 2 \u2014 hosts the MiniSearch index in-memory for fast BM25 + fuzzy search.",
    row: 2,
    col: 1,
  },
  {
    id: "tier3",
    tierLabel: "Tier 3",
    label: "Grep",
    sublabel: "file scan",
    description:
      "Zero-dependency fallback. Scans markdown files directly with pattern matching. Always available. Used directly by MCP server.",
    row: 2,
    col: 2,
  },
  // Row 3: Tier 2 (under daemon)
  {
    id: "tier2",
    tierLabel: "Tier 2",
    label: "MiniSearch",
    sublabel: "BM25 + fuzzy",
    description:
      "In-memory BM25 index with fuzzy matching. Runs inside the Daemon process. Activates when SQLite deps aren\u2019t installed but daemon is running.",
    row: 3,
    col: 1,
  },
  // Row 4: Storage
  {
    id: "files",
    label: "Markdown Files",
    sublabel: "docs/memory/*.md",
    description:
      "Source of truth. Human-readable markdown with YAML frontmatter. Git-trackable, portable, never locked in.",
    row: 4,
    col: 1,
  },
];

// Connections between nodes
const connections: { from: string; to: string; label?: string }[] = [
  { from: "claude", to: "mcp" },
  { from: "mcp", to: "tier1", label: "direct" },
  { from: "mcp", to: "daemon", label: "HTTP/UDS" },
  { from: "mcp", to: "tier3", label: "direct" },
  { from: "daemon", to: "tier2" },
  { from: "tier1", to: "files" },
  { from: "tier2", to: "files" },
  { from: "tier3", to: "files" },
];

/* ────────────────────────────────────────────────────────────
   LAYOUT (Desktop SVG coordinate system)
   ──────────────────────────────────────────────────────────── */

const ARCH_W = 700;
const ARCH_H = 520;
const BOX_W = 160;
const BOX_H = 62;
const TIER_BOX_H = 72; // taller for 3-row tier nodes

// Row Y positions (5 rows)
const ROW_Y: Record<number, number> = {
  0: 35, // Claude Code
  1: 130, // MCP Server (centered hub)
  2: 240, // Tier 1 | Daemon | Tier 3
  3: 345, // Tier 2 (under daemon)
  4: 450, // Markdown Files
};

// Column X positions per row
function getNodePos(node: ArchNode): { x: number; y: number } {
  const y = ROW_Y[node.row];
  // Row 2: 3 nodes evenly spaced
  if (node.row === 2) {
    const positions = [ARCH_W * 0.17, ARCH_W * 0.5, ARCH_W * 0.83];
    return { x: positions[node.col], y };
  }
  // All other rows: centered
  return { x: ARCH_W / 2, y };
}

/* ────────────────────────────────────────────────────────────
   PATH HELPERS
   ──────────────────────────────────────────────────────────── */

function getBoxH(node: ArchNode): number {
  return node.tierLabel ? TIER_BOX_H : BOX_H;
}

/**
 * Compute connection start/end points with edge-to-edge routing.
 * Specific connections use box edges instead of center-bottom/center-top.
 */
function getConnectionEndpoints(fromId: string, toId: string) {
  const fromNode = archNodes.find((n) => n.id === fromId)!;
  const toNode = archNodes.find((n) => n.id === toId)!;
  const from = getNodePos(fromNode);
  const to = getNodePos(toNode);

  // Same row → right edge to left edge
  if (fromNode.row === toNode.row) {
    return {
      x1: from.x + BOX_W / 2,
      y1: from.y,
      x2: to.x - BOX_W / 2,
      y2: to.y,
    };
  }

  // MCP → Tier 1: left edge of MCP → top edge of Tier 1
  if (fromId === "mcp" && toId === "tier1") {
    return {
      x1: from.x - BOX_W / 2,
      y1: from.y,
      x2: to.x,
      y2: to.y - getBoxH(toNode) / 2,
    };
  }

  // MCP → Tier 3: right edge of MCP → top edge of Tier 3
  if (fromId === "mcp" && toId === "tier3") {
    return {
      x1: from.x + BOX_W / 2,
      y1: from.y,
      x2: to.x,
      y2: to.y - getBoxH(toNode) / 2,
    };
  }

  // Tier 1 → Files: bottom edge of Tier 1 → left edge of Files
  if (fromId === "tier1" && toId === "files") {
    return {
      x1: from.x,
      y1: from.y + getBoxH(fromNode) / 2,
      x2: to.x - BOX_W / 2,
      y2: to.y,
    };
  }

  // Tier 3 → Files: bottom edge of Tier 3 → right edge of Files
  if (fromId === "tier3" && toId === "files") {
    return {
      x1: from.x,
      y1: from.y + getBoxH(fromNode) / 2,
      x2: to.x + BOX_W / 2,
      y2: to.y,
    };
  }

  // Default: center-bottom → center-top
  return {
    x1: from.x,
    y1: from.y + getBoxH(fromNode) / 2,
    x2: to.x,
    y2: to.y - getBoxH(toNode) / 2,
  };
}

function connectionPath(fromId: string, toId: string): string {
  const { x1, y1, x2, y2 } = getConnectionEndpoints(fromId, toId);
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

/* ────────────────────────────────────────────────────────────
   TIER BADGE COLORS
   ──────────────────────────────────────────────────────────── */

function nodeStyle(id: string) {
  switch (id) {
    case "tier1":
      return {
        border: "border-cyan-400/50",
        borderActive: "border-cyan-400 shadow-cyan-500/30",
        text: "text-cyan-300",
        textDim: "text-cyan-400/40",
        bg: "bg-cyan-500/5",
        sublabel: "text-cyan-400/60",
      };
    case "tier2":
      return {
        border: "border-violet-400/50",
        borderActive: "border-violet-400 shadow-violet-500/30",
        text: "text-violet-300",
        textDim: "text-violet-400/40",
        bg: "bg-violet-500/5",
        sublabel: "text-violet-400/60",
      };
    case "tier3":
      return {
        border: "border-rose-400/50",
        borderActive: "border-rose-400 shadow-rose-500/30",
        text: "text-rose-300",
        textDim: "text-rose-400/40",
        bg: "bg-rose-500/5",
        sublabel: "text-rose-400/60",
      };
    case "files":
      return {
        border: "border-emerald-500/40",
        borderActive: "border-emerald-400 shadow-emerald-500/30",
        text: "text-emerald-300",
        textDim: "text-emerald-400/40",
        bg: "bg-emerald-500/5",
        sublabel: "text-emerald-400/60",
      };
    default:
      return {
        border: "border-amber-500/30",
        borderActive: "border-amber-400 shadow-amber-500/25",
        text: "text-amber-300",
        textDim: "text-amber-400/40",
        bg: "bg-amber-500/5",
        sublabel: "text-amber-400/60",
      };
  }
}

/* ────────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────────── */

export default function MemoryArchitecture() {
  const [hovered, setHovered] = useState<string | null>(null);

  // Determine connected nodes
  const connectedIds = new Set<string>();
  if (hovered) {
    connectedIds.add(hovered);
    connections.forEach(({ from, to }) => {
      if (from === hovered || to === hovered) {
        connectedIds.add(from);
        connectedIds.add(to);
      }
    });
  }

  const isConnected = (id: string) => !hovered || connectedIds.has(id);
  const isActive = (id: string) => hovered === id;

  // Tooltip
  const tooltipNode = hovered
    ? (archNodes.find((n) => n.id === hovered) ?? null)
    : null;

  return (
    <div className="mt-10">
      {/* Section header */}
      <div className="mb-6 text-center">
        <h2 className="text-3xl font-bold text-white">Memory Architecture</h2>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
          3-tier graceful degradation — always works, even without heavy
          dependencies
        </p>
      </div>

      {/* Desktop architecture diagram */}
      <div className="hidden md:block">
        <div
          className="relative mx-auto"
          style={{
            maxWidth: `${ARCH_W}px`,
            aspectRatio: `${ARCH_W} / ${ARCH_H}`,
          }}
        >
          {/* SVG connections */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${ARCH_W} ${ARCH_H}`}
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="mem-arrow"
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-400/70" />
              </marker>
              <filter
                id="mem-glow"
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
                id="mem-glow-green"
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
            </defs>

            {connections.map(({ from, to, label }) => {
              const d = connectionPath(from, to);
              const isGreen =
                (from === "tier1" && to === "files") ||
                (from === "tier2" && to === "files") ||
                (from === "tier3" && to === "files");
              const dim = hovered && !(from === hovered || to === hovered);

              return (
                <g
                  key={`${from}-${to}`}
                  className={`transition-opacity duration-300 ${dim ? "opacity-10" : "opacity-100"}`}
                >
                  {/* Static bg */}
                  <path
                    d={d}
                    stroke="currentColor"
                    className={
                      isGreen ? "text-emerald-600/30" : "text-amber-600/30"
                    }
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                  />
                  {/* Animated overlay */}
                  <path
                    d={d}
                    stroke="currentColor"
                    className={`mem-dash-animate ${isGreen ? "text-emerald-500/50" : "text-amber-500/50"}`}
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                  />
                  {/* Traveling dot */}
                  <circle
                    r="2.5"
                    className={`fill-current ${isGreen ? "text-emerald-400" : "text-amber-400"}`}
                    filter={isGreen ? "url(#mem-glow-green)" : "url(#mem-glow)"}
                  >
                    <animateMotion
                      dur={isGreen ? "2.5s" : "2s"}
                      repeatCount="indefinite"
                      path={d}
                    />
                  </circle>
                  {/* Edge label */}
                  {label &&
                    (() => {
                      const { x1, y1, x2, y2 } = getConnectionEndpoints(
                        from,
                        to,
                      );
                      const mx = (x1 + x2) / 2;
                      const my = (y1 + y2) / 2;
                      // Rotate label to follow diagonal lines
                      const dx = x2 - x1;
                      const dy = y2 - y1;
                      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      if (angle > 90) angle -= 180;
                      if (angle < -90) angle += 180;
                      const shouldRotate =
                        Math.abs(angle) > 5 && Math.abs(angle) < 80;
                      // For near-vertical lines, place label at true midpoint
                      const ly = shouldRotate ? my - 8 : my;
                      return (
                        <text
                          x={mx}
                          y={ly}
                          className="fill-amber-400/70 text-xs"
                          fontFamily="monospace"
                          textAnchor="middle"
                          transform={
                            shouldRotate
                              ? `rotate(${angle}, ${mx}, ${ly})`
                              : undefined
                          }
                        >
                          {label}
                        </text>
                      );
                    })()}
                </g>
              );
            })}

            {/* Degradation arrows: Tier 1 → Daemon (Tier 2) → Tier 3 */}
            {(() => {
              const t1 = getNodePos(archNodes.find((n) => n.id === "tier1")!);
              const dm = getNodePos(archNodes.find((n) => n.id === "daemon")!);
              const t3 = getNodePos(archNodes.find((n) => n.id === "tier3")!);
              const y = ROW_Y[2];
              const dimT1D =
                hovered && hovered !== "tier1" && hovered !== "daemon";
              const dimDT3 =
                hovered && hovered !== "daemon" && hovered !== "tier3";
              return (
                <>
                  {/* Tier 1 → Daemon */}
                  <g
                    className={`transition-opacity duration-300 ${dimT1D ? "opacity-10" : "opacity-100"}`}
                  >
                    <line
                      x1={t1.x + BOX_W / 2 + 4}
                      y1={y}
                      x2={dm.x - BOX_W / 2 - 4}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-400/70"
                      strokeWidth="1.5"
                      strokeDasharray="5 3"
                      markerEnd="url(#mem-arrow)"
                    />
                    <text
                      x={(t1.x + dm.x) / 2}
                      y={y - 8}
                      textAnchor="middle"
                      className="fill-slate-300/70 text-[11px] italic"
                      fontFamily="monospace"
                    >
                      fallback
                    </text>
                  </g>
                  {/* Daemon → Tier 3 */}
                  <g
                    className={`transition-opacity duration-300 ${dimDT3 ? "opacity-10" : "opacity-100"}`}
                  >
                    <line
                      x1={dm.x + BOX_W / 2 + 4}
                      y1={y}
                      x2={t3.x - BOX_W / 2 - 4}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-400/70"
                      strokeWidth="1.5"
                      strokeDasharray="5 3"
                      markerEnd="url(#mem-arrow)"
                    />
                    <text
                      x={(dm.x + t3.x) / 2}
                      y={y - 8}
                      textAnchor="middle"
                      className="fill-slate-300/70 text-[11px] italic"
                      fontFamily="monospace"
                    >
                      fallback
                    </text>
                  </g>
                </>
              );
            })()}
          </svg>

          {/* HTML nodes */}
          {archNodes.map((node) => {
            const pos = getNodePos(node);
            const style = nodeStyle(node.id);
            const active = isActive(node.id);
            const connected = isConnected(node.id);
            const boxH = getBoxH(node);

            return (
              <div
                key={node.id}
                className={`absolute z-10 flex cursor-default flex-col items-center justify-center rounded-lg border transition-all duration-300 ${style.bg} ${
                  active
                    ? `${style.borderActive} shadow-lg`
                    : connected
                      ? style.border
                      : "border-slate-700/30"
                } ${!connected ? "opacity-30" : "opacity-100"}`}
                style={{
                  width: `${BOX_W}px`,
                  height: `${boxH}px`,
                  left: `${((pos.x - BOX_W / 2) / ARCH_W) * 100}%`,
                  top: `${((pos.y - boxH / 2) / ARCH_H) * 100}%`,
                }}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {node.tierLabel && (
                  <span
                    className={`font-mono text-[10px] font-medium tracking-wider uppercase ${connected ? style.sublabel : "text-slate-600"}`}
                  >
                    {node.tierLabel}
                  </span>
                )}
                <span
                  className={`font-mono text-sm font-semibold ${connected ? style.text : style.textDim}`}
                >
                  {node.label}
                </span>
                {node.sublabel && (
                  <span
                    className={`mt-0.5 text-xs ${connected ? style.sublabel : "text-slate-600"}`}
                  >
                    {node.sublabel}
                  </span>
                )}
              </div>
            );
          })}

          {/* Tooltip */}
          {tooltipNode && (
            <div
              className="bg-navy-950 pointer-events-none absolute z-20 w-56 rounded-lg border border-amber-500/20 px-3 py-2 text-center text-xs leading-relaxed text-slate-300 shadow-xl"
              style={{
                left: `${(getNodePos(tooltipNode).x / ARCH_W) * 100}%`,
                top: `${((getNodePos(tooltipNode).y + getBoxH(tooltipNode) / 2 + 8) / ARCH_H) * 100}%`,
                transform: "translate(-50%, 0)",
              }}
            >
              <span className="font-mono font-semibold text-amber-400">
                {tooltipNode.tierLabel
                  ? `${tooltipNode.tierLabel}: ${tooltipNode.label}`
                  : tooltipNode.label}
              </span>
              <p className="mt-1">{tooltipNode.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile architecture diagram */}
      <div className="block md:hidden">
        <div className="space-y-3 px-2">
          {/* Source */}
          <MobileArchCard
            node={archNodes.find((n) => n.id === "claude")!}
            icon={
              <svg
                className="h-4 w-4 text-amber-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            }
          />

          <MobileArrow />

          {/* MCP Server (full width — routing hub) */}
          <MobileArchCard
            node={archNodes.find((n) => n.id === "mcp")!}
            icon={
              <svg
                className="h-4 w-4 text-amber-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
              </svg>
            }
          />

          <MobileArrow label="selects best backend" />

          {/* 3 Tiers with route labels */}
          <div className="space-y-2">
            <MobileTierCard
              tier={1}
              label="SQLite"
              sublabel="FTS5 + sqlite-vec + RRF"
              desc="Full hybrid search with semantic vectors"
              route="direct"
            />
            <MobileFallback />
            <MobileTierCard
              tier={2}
              label="MiniSearch"
              sublabel="BM25 + fuzzy matching"
              desc="In-memory index hosted by background daemon (Hono + UDS)"
              route="via Daemon"
            />
            <MobileFallback />
            <MobileTierCard
              tier={3}
              label="Grep"
              sublabel="file scan"
              desc="Zero deps, always available"
              route="direct"
            />
          </div>

          <MobileArrow />

          {/* Files */}
          <MobileArchCard
            node={archNodes.find((n) => n.id === "files")!}
            accent="emerald"
            icon={
              <svg
                className="h-4 w-4 text-emerald-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M10 13H8M16 17H8M12 9H8" />
              </svg>
            }
          />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   MOBILE SUB-COMPONENTS
   ──────────────────────────────────────────────────────────── */

function MobileArchCard({
  node,
  accent = "amber",
  icon,
}: {
  node: ArchNode;
  accent?: "amber" | "emerald";
  icon: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const isAmber = accent === "amber";
  return (
    <div
      className={`cursor-pointer rounded-lg border p-3 transition-all duration-200 ${
        isAmber
          ? "border-amber-500/20 bg-amber-500/5 active:border-amber-400/40"
          : "border-emerald-500/20 bg-emerald-500/5 active:border-emerald-400/40"
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <div className="flex flex-col">
          <span
            className={`font-mono text-sm font-semibold ${isAmber ? "text-amber-300" : "text-emerald-300"}`}
          >
            {node.label}
          </span>
          {node.sublabel && (
            <span
              className={`text-xs ${isAmber ? "text-amber-400/50" : "text-emerald-400/50"}`}
            >
              {node.sublabel}
            </span>
          )}
        </div>
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ${expanded ? "mt-2 max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <p className="text-sm leading-relaxed text-slate-400">
          {node.description}
        </p>
      </div>
    </div>
  );
}

function MobileTierCard({
  tier,
  label,
  sublabel,
  desc,
  route,
}: {
  tier: number;
  label: string;
  sublabel: string;
  desc: string;
  route?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const opacity =
    tier === 1
      ? "border-amber-400/40"
      : tier === 2
        ? "border-amber-500/30"
        : "border-amber-600/25";
  return (
    <div
      className={`cursor-pointer rounded-lg border bg-amber-500/5 p-3 transition-all duration-200 active:border-amber-400/40 ${opacity}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-400">
          {tier}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-sm font-semibold text-amber-300">
            {label}
          </span>
          <span className="text-xs text-amber-400/50">{sublabel}</span>
        </div>
        {route && (
          <span className="shrink-0 rounded-full border border-slate-600/40 px-2 py-0.5 font-mono text-[10px] text-slate-400">
            {route}
          </span>
        )}
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ${expanded ? "mt-2 max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <p className="text-sm leading-relaxed text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

function MobileFallback() {
  return (
    <div className="flex items-center justify-center">
      <span className="font-mono text-xs text-slate-400/70 italic">
        fallback
      </span>
      <svg
        className="mx-1 h-3.5 w-3.5 text-slate-400/60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 5v14M19 12l-7 7-7-7" />
      </svg>
    </div>
  );
}

function MobileArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      {label && (
        <span className="mb-1 font-mono text-xs text-amber-500/40 italic">
          {label}
        </span>
      )}
      <svg
        className="h-5 w-5 text-amber-500/40"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path
          d="M10 3v14M5 12l5 5 5-5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
