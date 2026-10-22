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
