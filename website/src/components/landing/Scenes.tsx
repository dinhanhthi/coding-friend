import Play from "./Play";

// Drawings of real Coding Friend output for the feature grid. Each plays once when it scrolls into view and is
// decorative (aria-hidden): the card's title and caption say the same thing. Values are made up for the drawing.

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/* ---------- Plan: phases tick off, the session ends, /cf-plan-resume picks up the rest ---------- */

const PLAN_ROWS = [
  { phase: "Phase 1: Tokens", t1: 0.4, t2: 1.1 },
  { phase: "Phase 2: Toggle", t1: 1.3, t2: 2.0 },
  { phase: "Phase 3: Docs", t1: 2.2, t2: 5.4 },
];

export function PlanScene() {
  return (
    <Play className="scene scene-plan">
      <p className="scene__path">docs/plans/dark-mode/plan.md</p>
      <div className="scene-plan__table">
        {PLAN_ROWS.map((row) => (
          <div className="tr" key={row.phase}>
            <span
              className="st"
              style={{ "--t1": `${row.t1}s`, "--t2": `${row.t2}s` } as Vars}
            >
              <span className="st__todo">⬜ TODO</span>
              <span className="st__doing">🔄 IN PROGRESS</span>
              <span className="st__done">✅ DONE</span>
            </span>
            <span>{row.phase}</span>
          </div>
        ))}
      </div>
      <div className="scene-plan__resume">
        <p className="cut" style={{ "--t": "3s" } as Vars}>
          session ended
        </p>
        <p className="cmd" style={{ "--t": "3.8s" } as Vars}>
          <span className="caret">›</span> /cf-plan-resume dark-mode
        </p>
        <p className="out" style={{ "--t": "4.6s" } as Vars}>
          skips 2 done phases, resumes Phase 3
        </p>
      </div>
    </Play>
  );
}

/* ---------- Review: round 1 has findings, --fix applies them, round 2 is clean ---------- */

export function ReviewScene() {
  return (
    <Play className="scene scene-review">
      <p className="scene__cmd">
        <span className="caret">›</span> /cf-review --fix
      </p>
      <div className="rounds">
        <div className="round round--1">
          <span className="round__n">Round 1</span>
          <span className="sev">🚨 0</span>
          <span className="sev sev--warn">⚠️ 2</span>
          <span className="sev">💡 1</span>
        </div>
        <div className="round__fix">
          <span className="round__arc" />
          🔧 applying 2 fixes
        </div>
        <div className="round round--2">
          <span className="round__n">Round 2</span>
          <span className="sev">🚨 0</span>
          <span className="sev sev--ok">⚠️ 0</span>
          <span className="sev">💡 1</span>
        </div>
      </div>
      <p className="scene-review__status">Review status: COMPLETE</p>
    </Play>
  );
}

/* ---------- Checkpoint vs. auto-compact ---------- */

export function CheckpointScene() {
  return (
    <Play className="scene scene-checkpoint">
      <div className="cp cp--compact">
        <p className="cp__label">auto-compact</p>
        <div className="cp__meter">
          <i />
        </div>
        <div className="cp__chat">
          {Array.from({ length: 6 }, (_, index) => (
            <i
              key={index}
              style={{ "--w": `${55 + ((index * 23) % 40)}%` } as Vars}
            />
          ))}
        </div>
        <p className="cp__note">squeezed in place</p>
      </div>
      <div className="cp cp--save">
        <p className="cp__label">/cf-checkpoint</p>
        <div className="cp__file">
          <p className="cp__path">checkpoints/dark-mode.md</p>
          {["Goal", "Decisions", "Next steps"].map((head, index) => (
            <p key={head} className="cp__row" style={{ "--i": index } as Vars}>
              <b>{head}</b>
              <i />
            </p>
          ))}
        </div>
        <p className="cp__restore">
          <span className="caret">›</span> /cf-checkpoint-from dark-mode
        </p>
      </div>
    </Play>
  );
}

/* ---------- Security: four layers, four calls stopped or defused ---------- */

const GUARDS = [
  {
    call: "Read .env",
    rule: "privacy-block",
    verdict: "blocked",
    tone: "stop",
  },
  {
    call: "Read node_modules/react/index.js",
    rule: "scout-block",
    verdict: "skipped",
    tone: "stop",
  },
  {
    call: "WebFetch: “ignore previous instructions…”",
    rule: "content isolation",
    verdict: "treated as data",
    tone: "warn",
  },
  {
    call: "git commit  + API_KEY=sk-…",
    rule: "secret scan",
    verdict: "commit stopped",
    tone: "stop",
  },
];

export function GuardScene() {
  return (
    <Play className="scene scene-guard">
      <ul>
        {GUARDS.map((guard, index) => (
          <li key={guard.rule} style={{ "--i": index } as Vars}>
            <code>{guard.call}</code>
            <span className="scene-guard__rule">
              {guard.rule}
              <b className={`verdict verdict--${guard.tone}`}>
                {guard.verdict}
              </b>
            </span>
          </li>
        ))}
      </ul>
    </Play>
  );
}

/* ---------- Custom guides: Before, Rules, After slot into a skill's steps ---------- */

const STEPS = ["read diff", "check", "commit"];

export function GuideScene() {
  return (
    <Play className="scene scene-guide">
      <p className="scene__path">
        .coding-friend/skills/cf-commit-custom/SKILL.md
      </p>
      <div className="guide">
        <span
          className="guide__step guide__step--custom"
          style={{ "--t": "0.4s" } as Vars}
        >
          Before
          <small>branch name ok?</small>
        </span>
        {STEPS.map((step) => (
          <span key={step} className="guide__step">
            {step}
          </span>
        ))}
        <span
          className="guide__step guide__step--custom"
          style={{ "--t": "0.9s" } as Vars}
        >
          After
          <small>run tests</small>
        </span>
        <span className="guide__rules">Rules: ticket id in every subject</span>
      </div>
      <p className="guide__scope">
        <span>this project</span>
        <span>or ~/.coding-friend for all</span>
      </p>
    </Play>
  );
}

/* ---------- Fix ---------- */

const FIX_LINES = [
  ["Root cause", "refresh races the retry, auth.ts:88"],
  ["Fix", "await the refresh first, auth.ts:91"],
  ["Confirmed", "failing request replayed, now 200"],
  ["Tests", "142 passed, regression test added"],
];

export function FixScene() {
  return (
    <Play className="scene scene-fix">
      <p className="scene__signal">
        ✨ <b>CODING FRIEND</b> → /cf-fix activated
      </p>
      <dl>
        {FIX_LINES.map(([label, text], index) => (
          <div key={label} style={{ "--i": index } as Vars}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <p className="scene-fix__status">Status: DONE</p>
    </Play>
  );
}

/* ---------- Memory: tier 1 missing, tier 2 answers, grep waits underneath ---------- */

export function MemoryScene() {
  return (
    <Play className="scene scene-memory">
      <p className="scene-memory__query">
        <span className="muted">memory_search</span> how do we name hooks?
      </p>
      <ol className="scene-memory__tiers">
        <li className="tier tier--skip">
          <span className="tier__name">SQLite</span>
          <span className="tier__state">not installed</span>
        </li>
        <li className="tier tier--hit">
          <span className="tier__name">MiniSearch</span>
          <span className="tier__state">answered</span>
        </li>
        <li className="tier">
          <span className="tier__name">grep</span>
          <span className="tier__state">fallback</span>
        </li>
      </ol>
      <p className="scene-memory__hit">docs/memory/conventions/hook-names.md</p>
    </Play>
  );
}

/* ---------- Statusline (layout follows plugin/hooks/statusline.sh) ---------- */

const PLUGIN_VERSION = process.env.NEXT_PUBLIC_PLUGIN_VERSION ?? "0";

const GAUGES = [
  { label: "ctx", value: 42, tone: "ctx" },
  { label: "5h", value: 30, tone: "rate", reset: "2:30pm" },
  { label: "7d", value: 10, tone: "rate", reset: "Mar 15" },
];

export function StatuslineScene() {
  return (
    <Play className="scene scene-status">
      <p className="ss-prompt">
        <span className="caret">›</span> /cf-review
      </p>
      <div className="ss-lines">
        <p className="ss-model">Opus (1M)</p>
        <p>
          <span className="ss-cf">cf v{PLUGIN_VERSION}</span>
          <span className="ss-sep">│</span>
          <span className="ss-dir">acme-app</span>{" "}
          <span className="ss-branch">(main)</span>
        </p>
        <p className="ss-gauges">
          {GAUGES.map((g, index) => (
            <span
              key={g.label}
              className={`ss-gauge ss-gauge--${g.tone}`}
              style={{ "--v": g.value / 100, "--i": index } as Vars}
            >
              <span className="ss-gauge__label">{g.label}</span>
              <span className="ss-gauge__bar">
                <i />
              </span>
              <span className="ss-gauge__value">{g.value}%</span>
              {g.reset ? (
                <span className="ss-gauge__reset">→ {g.reset}</span>
              ) : null}
            </span>
          ))}
        </p>
        <p className="ss-work">
          <span>
            📋 Tasks:{" "}
            <span className="ss-swap">
              <span className="ss-swap__a">1/5</span>
              <span className="ss-swap__b">2/5</span>
            </span>
          </span>
          <span className="ss-sep">│</span>
          <span>
            🤖 Agent:{" "}
            <span className="ss-swap">
              <span className="ss-swap__a">cf-explorer</span>
              <span className="ss-swap__b">cf-reviewer</span>
            </span>
          </span>
        </p>
      </div>
    </Play>
  );
}
