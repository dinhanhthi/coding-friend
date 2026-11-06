"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../statusline.sh");

const INPUT = JSON.stringify({
  session_id: "sess-1234",
  current_dir: "/work/proj",
  model: { display_name: "Opus 4.6 (1M context)" },
  context_window: { used_percentage: 42 },
});

/**
 * A PATH of symlinks to everything in /bin and /usr/bin minus `excluded`.
 * `claude` is always left out so the account fallback never runs; `jq` is
 * left out to check the counter works without it (macOS ships /usr/bin/jq).
 */
function makeBin(root, excluded) {
  const bin = path.join(root, `bin-${excluded.join("-")}`);
  fs.mkdirSync(bin);
  for (const dir of ["/bin", "/usr/bin"]) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (excluded.includes(name)) continue;
      const link = path.join(bin, name);
      if (fs.existsSync(link)) continue;
      fs.symlinkSync(path.join(dir, name), link);
    }
  }
  return bin;
}

describe("statusline.sh chef counter", () => {
  let root;
  let store;
  let summary;
  let binWithJq;
  let binNoJq;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cf-statusline-"));
    binWithJq = makeBin(root, ["claude"]);
    binNoJq = makeBin(root, ["claude", "jq"]);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    const run = fs.mkdtempSync(path.join(root, "run-"));
    fs.mkdirSync(path.join(run, "home"));
    fs.mkdirSync(path.join(run, "cwd"));
    store = path.join(run, "store");
    fs.mkdirSync(path.join(store, "chefs"), { recursive: true });
    summary = path.join(store, "chefs", "summary.json");
  });

  function runStatusline(bin) {
    const run = path.dirname(store);
    const result = spawnSync("bash", [SCRIPT], {
      cwd: path.join(run, "cwd"),
      input: INPUT,
      encoding: "utf8",
      timeout: 5000,
      env: {
        HOME: path.join(run, "home"),
        PATH: bin,
        CLAUDE_CONFIG_DIR: path.join(run, "home", ".claude"),
        CF_ORCHESTRATOR_DIR: store,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    return result.stdout;
  }

  function writeSummary(inbox, paused) {
    const data = { schemaVersion: 1, inbox, paused, updatedAt: "x" };
    fs.writeFileSync(summary, JSON.stringify(data, null, 2) + "\n");
  }

  const withoutChef = (out) =>
    out.replace(/\x1b\[0;90m \| \x1b\[0m\x1b\[0;33mchef \d+!\x1b\[0m/, "");

  it("leaves the output unchanged when summary.json is missing", () => {
    const out = runStatusline(binWithJq);
    expect(out).not.toContain("chef");
    expect(out).toContain("📂 proj");
  });

  it("leaves the output unchanged when the counts are 0", () => {
    const baseline = runStatusline(binWithJq);
    writeSummary(0, 0);
    expect(runStatusline(binWithJq)).toBe(baseline);
  });

  it("adds 'chef N!' (inbox + paused) to line 2 when a chef needs the user", () => {
    const baseline = runStatusline(binWithJq);
    writeSummary(2, 1);
    const out = runStatusline(binWithJq);
    expect(out).toContain("chef 3!");
    expect(out.split("\n")[1]).toContain("chef 3!");
    expect(withoutChef(out)).toBe(baseline);
  });

  it("shows the counter without jq on PATH", () => {
    const baseline = runStatusline(binNoJq);
    writeSummary(0, 2);
    const out = runStatusline(binNoJq);
    expect(out).toContain("chef 2!");
    expect(withoutChef(out)).toBe(baseline);
  });

  it("ignores a FIFO at the summary path (no hang)", () => {
    const baseline = runStatusline(binWithJq);
    const fifo = spawnSync("mkfifo", [summary]);
    expect(fifo.status).toBe(0);
    expect(runStatusline(binWithJq)).toBe(baseline);
  });

  it("ignores a symlinked summary.json", () => {
    const baseline = runStatusline(binWithJq);
    const target = path.join(path.dirname(store), "elsewhere.json");
    fs.writeFileSync(target, JSON.stringify({ inbox: 4, paused: 0 }));
    fs.symlinkSync(target, summary);
    expect(runStatusline(binWithJq)).toBe(baseline);
  });

  it("ignores non-numeric or oversized counts", () => {
    const baseline = runStatusline(binWithJq);
    fs.writeFileSync(
      summary,
      '{"inbox": "$(touch pwned)", "paused": 12345678901234567890}',
    );
    expect(runStatusline(binWithJq)).toBe(baseline);
    expect(fs.existsSync(path.join(path.dirname(store), "cwd", "pwned"))).toBe(
      false,
    );
  });
});

/** The snapshot writer needs jq, and makeBin only links /bin and /usr/bin. */
const NO_SYSTEM_JQ_REASON = ["/bin", "/usr/bin"].some((dir) =>
  fs.existsSync(path.join(dir, "jq")),
)
  ? null
  : "no jq in /bin or /usr/bin (makeBin's minimal PATH), so the snapshot writer cannot run";

/** `it`, skipped with NO_SYSTEM_JQ_REASON when no jq is reachable. */
function itWithJq(name, fn) {
  it(name, (ctx) => {
    if (NO_SYSTEM_JQ_REASON) ctx.skip(NO_SYSTEM_JQ_REASON);
    return fn();
  });
}

describe("statusline.sh quota snapshot", () => {
  const FIVE_HOUR_ISO = "2026-11-05T17:40:00.000Z";
  const QUOTA_INPUT = JSON.stringify({
    session_id: "sess-1234",
    current_dir: "/work/proj",
    model: { display_name: "Opus 4.6 (1M context)" },
    rate_limits: {
      five_hour: { used_percentage: 69.47, resets_at: FIVE_HOUR_ISO },
      seven_day: { used_percentage: 100.4, resets_at: 1762628400000 },
    },
  });

  let root;
  let binWithJq;
  let binNoJq;
  let run;
  let quotaDir;
  let snapshot;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cf-statusline-quota-"));
    binWithJq = makeBin(root, ["claude"]);
    binNoJq = makeBin(root, ["claude", "jq"]);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    run = fs.mkdtempSync(path.join(root, "run-"));
    fs.mkdirSync(path.join(run, "home"));
    fs.mkdirSync(path.join(run, "cwd"));
    quotaDir = path.join(run, "quota");
    snapshot = path.join(quotaDir, "claude.json");
  });

  function runStatusline(bin) {
    const result = spawnSync("bash", [SCRIPT], {
      cwd: path.join(run, "cwd"),
      input: QUOTA_INPUT,
      encoding: "utf8",
      timeout: 5000,
      env: {
        HOME: path.join(run, "home"),
        PATH: bin,
        CLAUDE_CONFIG_DIR: path.join(run, "claude-config"),
        CF_ORCHESTRATOR_DIR: path.join(run, "store"),
        CF_QUOTA_DIR: quotaDir,
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("📂 proj");
    expect(result.stdout).not.toContain("schemaVersion");
    return result.stdout;
  }

  itWithJq(
    "writes a v1 snapshot (file 0600, dir 0700) with fixed key order",
    () => {
      const before = Math.floor(Date.now() / 1000);
      runStatusline(binWithJq);
      const after = Math.ceil(Date.now() / 1000);

      expect(fs.statSync(quotaDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(snapshot).mode & 0o777).toBe(0o600);
      const snap = JSON.parse(fs.readFileSync(snapshot, "utf8"));
      expect(Object.keys(snap)).toEqual([
        "schemaVersion",
        "provider",
        "configDir",
        "windows",
        "source",
        "measuredAt",
      ]);
      expect(snap).toMatchObject({
        schemaVersion: 1,
        provider: "claude",
        configDir: path.join(run, "claude-config"),
        source: "statusline",
      });
      expect(Object.keys(snap.windows.five_hour)).toEqual([
        "percentUsed",
        "resetsAt",
      ]);
      expect(snap.windows).toEqual({
        five_hour: {
          percentUsed: 69.5,
          resetsAt: Math.floor(Date.parse(FIVE_HOUR_ISO) / 1000),
        },
        seven_day: { percentUsed: 100, resetsAt: 1762628400 },
      });
      expect(snap.measuredAt).toBeGreaterThanOrEqual(before);
      expect(snap.measuredAt).toBeLessThanOrEqual(after);
    },
  );

  itWithJq(
    "leaves a fresh identical snapshot untouched on the next run",
    () => {
      runStatusline(binWithJq);
      const past = new Date(Date.now() - 10_000);
      fs.utimesSync(snapshot, past, past);
      const mtime = fs.statSync(snapshot).mtimeMs;
      runStatusline(binWithJq);
      expect(fs.statSync(snapshot).mtimeMs).toBe(mtime);
    },
  );

  it("writes nothing and still prints the bar without jq", () => {
    runStatusline(binNoJq);
    expect(fs.existsSync(snapshot)).toBe(false);
  });

  function existingSnapshot(
    aheadS,
    windows = { five_hour: { percentUsed: 1, resetsAt: 1 } },
  ) {
    fs.mkdirSync(quotaDir, { mode: 0o700 });
    const text = JSON.stringify({
      schemaVersion: 1,
      provider: "claude",
      configDir: "/x",
      windows,
      source: "mod",
      measuredAt: Math.floor(Date.now() / 1000) + aheadS,
    });
    fs.writeFileSync(snapshot, text);
    return text;
  }

  itWithJq(
    "keeps an existing snapshot whose measuredAt is newer (within the clock-skew slack)",
    () => {
      const newer = existingSnapshot(60);
      runStatusline(binWithJq);
      expect(fs.readFileSync(snapshot, "utf8")).toBe(newer);
    },
  );

  itWithJq(
    "overwrites a snapshot whose measuredAt is far in the future (corrupt)",
    () => {
      // Same windows as the input, so the "identical and fresh" dedupe is hit too
      existingSnapshot(10 * 365 * 86_400, {
        five_hour: {
          percentUsed: 69.5,
          resetsAt: Math.floor(Date.parse(FIVE_HOUR_ISO) / 1000),
        },
        seven_day: { percentUsed: 100, resetsAt: 1762628400 },
      });
      runStatusline(binWithJq);
      expect(JSON.parse(fs.readFileSync(snapshot, "utf8")).source).toBe(
        "statusline",
      );
    },
  );

  itWithJq(
    "cleans up stale temp files but never a .claude.json in the quota dir",
    () => {
      fs.mkdirSync(quotaDir, { mode: 0o700 });
      const old = new Date(Date.now() - 2 * 3600 * 1000);
      const keep = path.join(quotaDir, ".claude.json");
      const stale = path.join(quotaDir, ".claude.Ab12Cd");
      for (const file of [keep, stale]) {
        fs.writeFileSync(file, "x");
        fs.utimesSync(file, old, old);
      }
      runStatusline(binWithJq);
      expect(fs.existsSync(keep)).toBe(true);
      expect(fs.existsSync(stale)).toBe(false);
    },
  );

  itWithJq("refuses to write through a symlinked claude.json", () => {
    fs.mkdirSync(quotaDir, { mode: 0o700 });
    const target = path.join(run, "elsewhere.json");
    fs.writeFileSync(target, "keep");
    fs.symlinkSync(target, snapshot);
    runStatusline(binWithJq);
    expect(fs.lstatSync(snapshot).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("keep");
  });
});
