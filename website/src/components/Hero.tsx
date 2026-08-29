const GITHUB_HREF = "https://github.com/dinhanhthi/coding-friend";
const PLUGIN_VERSION = process.env.NEXT_PUBLIC_PLUGIN_VERSION;
const CLI_VERSION = process.env.NEXT_PUBLIC_CLI_VERSION;

const NODES = [
  { x: 78, y: 66, label: "/cf-plan", lx: 78, ly: 48 },
  { x: 286, y: 88, label: "/cf-review", lx: 286, ly: 70 },
  { x: 312, y: 212, label: "/cf-fix", lx: 312, ly: 236 },
  { x: 58, y: 210, label: "cf-explorer", lx: 58, ly: 234 },
  { x: 140, y: 312, label: "docs/", lx: 140, ly: 336 },
  { x: 252, y: 300, label: "memory", lx: 252, ly: 324 },
];

const CX = 180;
const CY = 186;

/* Deterministic readout envelope — same on server and client (no Math.random). */
const METER_BARS = Array.from({ length: 64 }, (_, i) => ({
  height:
    6 +
    18 * Math.abs(Math.sin(i / 4.2)) * (0.55 + 0.45 * Math.sin(i * 1.7 + 1)),
  opacity: 0.35 + 0.55 * Math.abs(Math.sin(i * 0.9 + 0.4)),
}));

function CodebaseGraph() {
  return (
    <figure className="apparatus mx-auto w-full max-w-[400px] lg:justify-self-end">
      <svg viewBox="0 0 360 360" role="img" aria-hidden="true">
        {NODES.map((node) => (
          <line
            key={`edge-${node.label}`}
            className="graph-edge"
            x1={CX}
            y1={CY}
            x2={node.x}
            y2={node.y}
          />
        ))}
        {NODES.map((node) => (
          <g key={`node-${node.label}`}>
            <circle className="graph-node" cx={node.x} cy={node.y} r="5" />
            <text
              className="graph-label"
              x={node.lx}
              y={node.ly}
              textAnchor="middle"
            >
              {node.label}
            </text>
          </g>
        ))}
        <circle className="graph-core-ring" cx={CX} cy={CY} r="28" />
        <circle className="graph-core" cx={CX} cy={CY} r="15" />
        <text
          className="graph-core-label"
          x={CX}
          y={CY + 4}
          textAnchor="middle"
        >
          cf
        </text>
      </svg>
      <p className="callout callout--left" style={{ "--y": "31%" } as never}>
        host · claude code
      </p>
      <p className="callout callout--right" style={{ "--y": "46%" } as never}>
        memory · mcp
      </p>
      <p className="callout callout--left" style={{ "--y": "70%" } as never}>
        {PLUGIN_VERSION
          ? `plugin · v${PLUGIN_VERSION}`
          : "hooks · auto-approve"}
      </p>
    </figure>
  );
}

export default function Hero() {
  return (
    <>
      <section className="hero-foundry">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14 lg:pt-20 lg:pb-28">
          <div className="min-w-0">
            <p className="mono-label">00 · toolkit</p>
            <h1 className="hero-title mt-4 text-[clamp(2.6rem,3.8vw+1rem,4rem)]">
              make your coding agent&nbsp;<em>work</em>&nbsp;like an engineer.
            </h1>
            <p className="text-ink-2 mt-5 max-w-[52ch] text-lg leading-relaxed lowercase">
              Coding Friend adds skills, agents, and hooks to Claude Code,
              Codex, and the agents you already use — plan, implement, review,
              ship, with project memory underneath.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a
                href="#install"
                className="bg-accent text-accent-ink inline-flex h-11 items-center rounded-[6px] px-5 font-medium whitespace-nowrap lowercase transition-[transform,opacity] duration-[220ms] [transition-timing-function:var(--ease-out)] hover:-translate-y-[1.5px] hover:opacity-95 active:translate-y-px"
              >
                Install
              </a>
              <a
                href={GITHUB_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="u-grow text-ink pb-0.5 font-medium whitespace-nowrap lowercase"
              >
                View on GitHub ↗
              </a>
            </div>
          </div>

          <CodebaseGraph />
        </div>
      </section>

      <aside className="meter" aria-label="build readout">
        <p className="mono-label whitespace-nowrap">
          {PLUGIN_VERSION ? `plugin · v${PLUGIN_VERSION}` : "coding friend"}
        </p>
        <div className="meter-bars" aria-hidden="true">
          {METER_BARS.map((bar, i) => (
            <span
              key={i}
              style={{ height: `${bar.height}px`, opacity: bar.opacity }}
            />
          ))}
        </div>
        <p className="mono-label whitespace-nowrap">
          {CLI_VERSION ? `cli · v${CLI_VERSION}` : "npm · coding-friend-cli"}
        </p>
      </aside>
    </>
  );
}
