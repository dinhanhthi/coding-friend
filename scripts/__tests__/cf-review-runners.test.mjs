/**
 * Enforced-deadline regression tests for the cf-review external runners
 * (plan task 3.2).
 *
 * Covers plugin/skills/cf-review/scripts/{run-with-timeout,run-agent-review,
 * run-codex-review}.sh with FAKE CLI fixtures only — no external agent, no
 * network, no paid API call is ever invoked here.
 *
 * Process semantics tested are POSIX (macOS/Linux): process groups, TERM/KILL
 * and 128+N signal exits. Windows is explicitly out of scope — the runners make
 * no claim about process groups there, and these tests skip on win32.
 *
 * The two timeout mechanisms are exercised separately: `gnu` (timeout(1) with
 * --kill-after) and `fallback` (perl). Whichever is unavailable on this machine
 * is skipped with a recorded reason — see the "mechanism coverage" test, which
 * prints the platform and the mechanisms actually covered.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const scriptsDir = path.join(repoRoot, "plugin/skills/cf-review/scripts");
const timeoutScript = path.join(scriptsDir, "run-with-timeout.sh");
const agentScript = path.join(scriptsDir, "run-agent-review.sh");
const codexScript = path.join(scriptsDir, "run-codex-review.sh");

const POSIX = process.platform !== "win32";

const tmpDirs = [];
function mkTmp(prefix = "cf-runners-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

process.on("exit", () => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/**
 * Isolate fixtures from the developer's global/system git config AND from the
 * real `~/.coding-friend/config.json`: the runners read a global config as the
 * lower half of their local-over-global merge, so a developer's own
 * `review.agentTimeout` must never decide what these tests observe.
 */
const baseEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  HOME: mkTmp("cf-runners-home-"),
};

/**
 * A deliberately minimal PATH: it carries the POSIX tools the runners need
 * (bash, git, perl, grep) but can never reach a real `claude`/`codex`/`gemini`
 * install, so no test can accidentally start a paid agent run.
 */
const nodeBinDir = mkTmp("cf-runners-node-");
// The config read shells out to node. node usually lives in a version-manager
// bin dir that ALSO holds real agent CLIs, so the whole dir can never go on
// this PATH — a directory containing nothing but this symlink can.
fs.symlinkSync(process.execPath, path.join(nodeBinDir, "node"));
const SAFE_PATH = `${nodeBinDir}:/usr/bin:/bin:/usr/sbin:/sbin`;

/**
 * True when a REAL agent CLI is reachable on SAFE_PATH (some distros put npm
 * global bins in /usr/bin). The "missing binary" tests below skip in that case:
 * proving a 127 is never worth the risk of starting a paid agent run.
 */
function realCliOnSafePath(name) {
  const res = spawnSync("/bin/sh", ["-c", `command -v ${name}`], {
    env: { PATH: SAFE_PATH },
    encoding: "utf8",
  });
  return Boolean((res.stdout || "").trim());
}

/* ---------------------------------------------------------------------------
 * Process helpers
 * ------------------------------------------------------------------------ */

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `pid` is gone; returns true if it died inside `budgetMs`. */
async function waitForDead(pid, budgetMs) {
  if (!pid) return false; // an unreadable pid must fail the assertion, not pass it
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await sleep(50);
  }
  return !isAlive(pid);
}

function readPid(file) {
  for (let i = 0; i < 100; i += 1) {
    try {
      const raw = fs.readFileSync(file, "utf8").trim();
      if (raw) return Number(raw);
    } catch {
      /* not written yet */
    }
    // Synchronous spin: the fixture writes its pid within a few ms.
    spawnSync("sh", ["-c", "sleep 0.05"]);
  }
  return 0;
}

/* ---------------------------------------------------------------------------
 * Fake CLI fixtures — never a real agent binary
 * ------------------------------------------------------------------------ */

/**
 * One fake CLI, behaviour driven by env vars so a test never needs a bespoke
 * script: CF_FAKE_ARGV_FILE, CF_FAKE_PID_FILE, CF_FAKE_STDIN_FILE,
 * CF_FAKE_OUT, CF_FAKE_SLEEP, CF_FAKE_SIGNAL, CF_FAKE_EXIT.
 */
const FAKE_CLI = `#!/bin/sh
if [ -n "\${CF_FAKE_ARGV_FILE:-}" ]; then
  : >"$CF_FAKE_ARGV_FILE"
  for a in "$@"; do printf '%s\\n' "$a" >>"$CF_FAKE_ARGV_FILE"; done
fi
[ -n "\${CF_FAKE_PID_FILE:-}" ] && echo $$ >"$CF_FAKE_PID_FILE"
if [ -n "\${CF_FAKE_STDIN_FILE:-}" ]; then cat >"$CF_FAKE_STDIN_FILE"; fi
[ -n "\${CF_FAKE_OUT:-}" ] && printf '%s' "$CF_FAKE_OUT"
[ -n "\${CF_FAKE_SLEEP:-}" ] && sleep "$CF_FAKE_SLEEP"
[ -n "\${CF_FAKE_SIGNAL:-}" ] && kill -"$CF_FAKE_SIGNAL" $$
exit \${CF_FAKE_EXIT:-0}
`;

function makeBin(name, body = FAKE_CLI) {
  const dir = mkTmp("cf-runners-bin-");
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  fs.chmodSync(file, 0o755);
  return dir;
}

/* ---------------------------------------------------------------------------
 * Mechanism selection — which timeout paths this machine can cover
 * ------------------------------------------------------------------------ */

function findGnuTimeout() {
  for (const candidate of ["timeout", "gtimeout"]) {
    const which = spawnSync("sh", ["-c", `command -v ${candidate}`], {
      encoding: "utf8",
    });
    const bin = (which.stdout || "").trim();
    if (!bin) continue;
    const probe = spawnSync(bin, ["-k", "1", "1", "sh", "-c", "exit 0"]);
    if (probe.status === 0) return bin;
  }
  return null;
}

const gnuTimeout = POSIX ? findGnuTimeout() : null;
const hasPerl =
  POSIX && spawnSync("sh", ["-c", "command -v perl"]).status === 0;

const MECHANISMS = [
  {
    name: "fallback",
    available: hasPerl,
    skipReason: "perl not on PATH",
  },
  {
    name: "gnu",
    available: Boolean(gnuTimeout),
    skipReason:
      "no timeout(1)/gtimeout(1) supporting --kill-after on this machine",
  },
];

test("mechanism coverage is recorded, not assumed", () => {
  const covered = MECHANISMS.filter((m) => m.available).map((m) => m.name);
  const skipped = MECHANISMS.filter((m) => !m.available).map(
    (m) => `${m.name} (${m.skipReason})`,
  );
  // Printed so a CI log states which process semantics were actually exercised.
  console.log(
    `[cf-review-runners] platform=${process.platform} covered=[${covered.join(", ")}] skipped=[${skipped.join(", ")}]`,
  );
  assert.ok(
    covered.length >= 1,
    "at least one timeout mechanism must be testable on a POSIX host",
  );
});

function runTimeout(args, { env = {}, input, cwd } = {}) {
  return spawnSync("bash", [timeoutScript, ...args], {
    cwd,
    env: { ...baseEnv, ...env },
    encoding: "utf8",
    input,
    timeout: 20000,
  });
}

/* ---------------------------------------------------------------------------
 * run-with-timeout.sh — per mechanism
 * ------------------------------------------------------------------------ */

for (const mech of MECHANISMS) {
  const opts = {
    skip: !POSIX
      ? "POSIX-only process semantics"
      : !mech.available
        ? mech.skipReason
        : false,
    timeout: 20000,
  };
  const env = { CF_TIMEOUT_IMPL: mech.name };
  const label = `[${mech.name}]`;

  test(
    `${label} a command that finishes keeps its output and exit 0`,
    opts,
    () => {
      const res = runTimeout(["5", "sh", "-c", "printf hello"], { env });
      assert.equal(res.status, 0);
      assert.equal(res.stdout, "hello");
    },
  );

  test(`${label} a non-zero exit code is propagated verbatim`, opts, () => {
    const res = runTimeout(["5", "sh", "-c", "exit 7"], { env });
    assert.equal(res.status, 7);
  });

  test(`${label} a signalled command reports 128+N`, opts, () => {
    const res = runTimeout(["5", "sh", "-c", "kill -TERM $$"], { env });
    assert.equal(res.status, 143, "SIGTERM must surface as 128+15");
  });

  test(`${label} a missing binary exits 127 without hanging`, opts, () => {
    const res = runTimeout(["5", "cf-no-such-binary-xyz"], { env });
    assert.equal(res.status, 127);
  });

  test(`${label} stdin reaches the command`, opts, () => {
    const res = runTimeout(["5", "sh", "-c", "wc -c"], {
      env,
      input: "abcde",
    });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "5");
  });

  test(
    `${label} a child sleeping past the deadline is killed with 124`,
    opts,
    async () => {
      const dir = mkTmp();
      const pidFile = path.join(dir, "pid");
      const started = Date.now();
      const res = runTimeout(
        ["1", "sh", "-c", `echo $$ >"${pidFile}"; sleep 30`],
        { env },
      );
      const elapsed = Date.now() - started;
      assert.equal(res.status, 124, "deadline exceeded must exit 124");
      assert.ok(elapsed < 8000, `killed promptly (took ${elapsed}ms)`);
      const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
      assert.ok(
        await waitForDead(pid, 3000),
        "the child must not survive its deadline",
      );
    },
  );

  test(
    `${label} a child that ignores TERM is KILLed after the grace period`,
    opts,
    async () => {
      const dir = mkTmp();
      const pidFile = path.join(dir, "pid");
      const started = Date.now();
      const res = runTimeout(
        [
          "1",
          "sh",
          "-c",
          `trap '' TERM; echo $$ >"${pidFile}"; while true; do sleep 1; done`,
        ],
        { env },
      );
      const elapsed = Date.now() - started;
      assert.equal(res.status, 124);
      assert.ok(
        elapsed >= 2500,
        `the 2s grace must be honoured before KILL (took ${elapsed}ms)`,
      );
      assert.ok(elapsed < 10000, `but still bounded (took ${elapsed}ms)`);
      const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
      assert.ok(
        await waitForDead(pid, 3000),
        "a TERM-ignoring child must still be killed",
      );
    },
  );

  test(`${label} a grandchild dies with the process group`, opts, async () => {
    const dir = mkTmp();
    const childPidFile = path.join(dir, "child");
    const grandPidFile = path.join(dir, "grand");
    const res = runTimeout(
      [
        "1",
        "sh",
        "-c",
        `sleep 30 & echo $! >"${grandPidFile}"; echo $$ >"${childPidFile}"; sleep 30`,
      ],
      { env },
    );
    assert.equal(res.status, 124);
    const childPid = Number(fs.readFileSync(childPidFile, "utf8").trim());
    const grandPid = Number(fs.readFileSync(grandPidFile, "utf8").trim());
    assert.ok(await waitForDead(childPid, 4000), "the child must be dead");
    assert.ok(
      await waitForDead(grandPid, 4000),
      "the grandchild must be killed with the group, not left running",
    );
  });
}

/* ---------------------------------------------------------------------------
 * GNU path argv contract
 *
 * Real GNU process semantics can only be observed where timeout(1) exists (see
 * the skips above). What IS verifiable everywhere is the argv this repo sends:
 * a kill-after must always be passed, or a hung child would survive the TERM.
 * The stand-in below records the real argv — nothing is inferred from docs.
 * ------------------------------------------------------------------------ */

test("the gnu path always passes a kill-after", { skip: !POSIX }, () => {
  const dir = mkTmp();
  const argvFile = path.join(dir, "timeout-argv");
  const bin = makeBin(
    "timeout",
    `#!/bin/sh
: >"$CF_FAKE_TO_ARGV"
for a in "$@"; do printf '%s\\n' "$a" >>"$CF_FAKE_TO_ARGV"; done
[ "$1" = "-k" ] || exit 125
shift 3
exec "$@"
`,
  );
  const res = runTimeout(["7", "sh", "-c", "printf done"], {
    env: {
      CF_TIMEOUT_IMPL: "gnu",
      PATH: `${bin}:${SAFE_PATH}`,
      CF_FAKE_TO_ARGV: argvFile,
    },
  });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout, "done");
  const argv = fs.readFileSync(argvFile, "utf8").trim().split("\n");
  assert.deepEqual(
    argv.slice(0, 3),
    ["-k", "2", "7"],
    "kill-after 2s then the deadline, in GNU timeout's own argument order",
  );
});

/* ---------------------------------------------------------------------------
 * run-with-timeout.sh — refusing to launch
 * ------------------------------------------------------------------------ */

test("a non-positive deadline is refused before anything is launched", () => {
  const dir = mkTmp();
  const marker = path.join(dir, "ran");
  for (const bad of ["0", "-5", "abc", "1.5", ""]) {
    const res = runTimeout([bad, "sh", "-c", `touch "${marker}"`]);
    assert.equal(res.status, 125, `"${bad}" must be refused`);
    assert.match(res.stderr, /CF_TIMEOUT=error/);
  }
  assert.equal(fs.existsSync(marker), false, "nothing may be launched");
});

test("an unknown mechanism is an error, never an unbounded launch", () => {
  const dir = mkTmp();
  const marker = path.join(dir, "ran");
  const res = runTimeout(["5", "sh", "-c", `touch "${marker}"`], {
    env: { CF_TIMEOUT_IMPL: "bogus" },
  });
  assert.equal(res.status, 125);
  assert.match(res.stderr, /CF_TIMEOUT=error unknown CF_TIMEOUT_IMPL/);
  assert.equal(fs.existsSync(marker), false);
});

test("--check reports whether a deadline can be enforced at all", () => {
  assert.equal(runTimeout(["--check", "5"]).status, 0);
  const bad = runTimeout(["--check", "0"]);
  assert.equal(bad.status, 125);
  assert.match(bad.stderr, /CF_TIMEOUT=error/);
});

test("--config-timeout rejects a present-but-unusable agentTimeout", () => {
  const dir = mkTmp();
  const good = path.join(dir, "good.json");
  fs.writeFileSync(good, JSON.stringify({ review: { agentTimeout: 42 } }));
  assert.equal(
    runTimeout(["--config-timeout", good, "300"]).stdout.trim(),
    "42",
  );

  const missing = path.join(dir, "missing.json");
  assert.equal(
    runTimeout(["--config-timeout", missing, "300"]).stdout.trim(),
    "300",
    "an absent config falls back to the default",
  );

  for (const value of ['"abc"', "0", "-3", "null"]) {
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, `{ "review": { "agentTimeout": ${value} } }`);
    const res = runTimeout(["--config-timeout", bad, "300"]);
    assert.equal(res.status, 2, `${value} must be rejected`);
    assert.match(res.stderr, /invalid review\.agentTimeout/);
  }
});

/** A fake HOME whose `~/.coding-friend/config.json` holds `review`. */
function makeHome(review) {
  const home = mkTmp("cf-runners-home-");
  fs.mkdirSync(path.join(home, ".coding-friend"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".coding-friend", "config.json"),
    typeof review === "string" ? review : JSON.stringify({ review }),
  );
  return home;
}

function writeLocal(dir, contents) {
  const file = path.join(dir, "config.json");
  fs.writeFileSync(
    file,
    typeof contents === "string" ? contents : JSON.stringify(contents),
  );
  return file;
}

test("--config-timeout takes the local value over the global one", () => {
  const dir = mkTmp();
  const HOME = makeHome({ withCodex: true, agentTimeout: 7 });
  const local = writeLocal(dir, { review: { agentTimeout: 9 } });
  assert.equal(
    runTimeout(["--config-timeout", local, "300"], {
      env: { HOME },
    }).stdout.trim(),
    "9",
  );
});

test("--config-timeout reads the key it is asked for, defaulting to agentTimeout", () => {
  const dir = mkTmp();
  const HOME = makeHome({ agentTimeout: 7, nativeTimeout: 900 });

  // cf-review Step 6 resolves the in-session budget through this same reader.
  // The external-agent value must never stand in for it.
  const local = writeLocal(dir, { review: { nativeTimeout: 800 } });
  assert.equal(
    runTimeout(["--config-timeout", local, "600", "nativeTimeout"], {
      env: { HOME },
    }).stdout.trim(),
    "800",
  );

  // Per-field merge holds for the new key too: a local file that only sets
  // agentTimeout keeps the global nativeTimeout, and vice versa.
  const siblings = writeLocal(dir, { review: { agentTimeout: 11 } });
  assert.equal(
    runTimeout(["--config-timeout", siblings, "600", "nativeTimeout"], {
      env: { HOME },
    }).stdout.trim(),
    "900",
  );
  assert.equal(
    runTimeout(["--config-timeout", siblings, "300"], {
      env: { HOME },
    }).stdout.trim(),
    "11",
    "no key argument still resolves agentTimeout",
  );

  // A present-but-unusable value is named by the key that was asked for.
  const bad = writeLocal(dir, { review: { nativeTimeout: 0 } });
  const res = runTimeout(["--config-timeout", bad, "600", "nativeTimeout"], {
    env: { HOME },
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /invalid review\.nativeTimeout/);

  // Configured nowhere → the caller's default, not the other key's value.
  const empty = writeLocal(dir, { review: { agentTimeout: 11 } });
  assert.equal(
    runTimeout(["--config-timeout", empty, "600", "nativeTimeout"], {
      env: { HOME: mkTmp("cf-runners-home-") },
    }).stdout.trim(),
    "600",
  );
});

test("--config-timeout keeps the global value when local sets other fields", () => {
  const dir = mkTmp();
  const HOME = makeHome({ agentTimeout: 7, maxRounds: 2 });

  // A local file that says nothing about agentTimeout must not wipe the
  // global one — the merge is per field, not per `review` block.
  const siblings = writeLocal(dir, {
    docsDir: "docs",
    review: { withCodex: true },
  });
  assert.equal(
    runTimeout(["--config-timeout", siblings, "300"], {
      env: { HOME },
    }).stdout.trim(),
    "7",
  );

  // Same when there is no local config at all.
  assert.equal(
    runTimeout(["--config-timeout", path.join(dir, "absent.json"), "300"], {
      env: { HOME },
    }).stdout.trim(),
    "7",
  );
});

test("--config-timeout rejects a local value that overrides a valid global one", () => {
  const dir = mkTmp();
  const HOME = makeHome({ agentTimeout: 7 });
  const local = writeLocal(dir, { review: { agentTimeout: 0 } });
  const res = runTimeout(["--config-timeout", local, "300"], { env: { HOME } });
  assert.equal(res.status, 2, "a misconfigured local value is never masked");
  assert.match(res.stderr, /invalid review\.agentTimeout/);
});

test("--config-timeout warns and stays bounded on a malformed config", () => {
  const dir = mkTmp();
  const broken = writeLocal(dir, '{ "review": { "agentTimeout": 5 ');

  // Nothing else configures a deadline: the run must still be bounded.
  const alone = runTimeout(["--config-timeout", broken, "300"], {
    env: { HOME: makeHome({}) },
  });
  assert.equal(alone.status, 0);
  assert.equal(
    alone.stdout.trim(),
    "300",
    "a finite default, never no deadline",
  );
  assert.match(alone.stderr, /CF_TIMEOUT=warn/);

  // A broken local file contributes nothing, so a valid global still applies.
  const res = runTimeout(["--config-timeout", broken, "300"], {
    env: { HOME: makeHome({ agentTimeout: 7 }) },
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "7");
  assert.match(res.stderr, /CF_TIMEOUT=warn/);

  // A malformed GLOBAL config must not take the local value down with it.
  const good = writeLocal(dir, { review: { agentTimeout: 11 } });
  const withBadGlobal = runTimeout(["--config-timeout", good, "300"], {
    env: { HOME: makeHome("{ not json at all") },
  });
  assert.equal(withBadGlobal.status, 0);
  assert.equal(withBadGlobal.stdout.trim(), "11");
  assert.match(withBadGlobal.stderr, /CF_TIMEOUT=warn/);
});

test("--config-timeout stays bounded when node is unavailable", () => {
  const dir = mkTmp();
  const local = writeLocal(dir, { review: { agentTimeout: 9 } });
  const res = runTimeout(["--config-timeout", local, "300"], {
    // A PATH without node: the value cannot be parsed at all, and a regex over
    // JSON is not an acceptable substitute — so the default must hold.
    env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: makeHome({}) },
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "300");
  assert.match(res.stderr, /CF_TIMEOUT=warn node not found/);
});

test("--config-timeout resolves a relative path against the repo root", () => {
  const root = mkTmp();
  const elsewhere = mkTmp();
  fs.mkdirSync(path.join(root, ".coding-friend"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".coding-friend", "config.json"),
    JSON.stringify({ review: { agentTimeout: 13 } }),
  );
  const env = { MAIN_REPO_ROOT: root, HOME: makeHome({}) };

  // Run from a directory that is not the repo root: a cwd-relative read would
  // find nothing and silently use the default.
  assert.equal(
    runTimeout(["--config-timeout", ".coding-friend/config.json", "300"], {
      cwd: elsewhere,
      env,
    }).stdout.trim(),
    "13",
  );
});

/* ---------------------------------------------------------------------------
 * run-agent-review.sh
 * ------------------------------------------------------------------------ */

function writeConfig(dir, extra = {}) {
  const file = path.join(dir, "config.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ docsDir: "docs", review: { agentTimeout: 1, ...extra } }),
  );
  return file;
}

function makePrompt(dir) {
  const file = path.join(dir, "prompt.md");
  fs.writeFileSync(file, "DUMMY_PROMPT: review the diff\n");
  return file;
}

/** Run run-agent-review.sh with a fake `claude` on PATH. */
function runAgent({
  args,
  cwd,
  bin,
  fake = {},
  config,
  env = {},
  timeout = 20000,
}) {
  return spawnSync("bash", [agentScript, ...args], {
    cwd,
    env: {
      ...baseEnv,
      PATH: bin ? `${bin}:${SAFE_PATH}` : SAFE_PATH,
      CF_CONFIG_FILE: config ?? "",
      ...fake,
      ...env,
    },
    encoding: "utf8",
    timeout,
  });
}

const posixOnly = { skip: POSIX ? false : "POSIX-only", timeout: 25000 };

test(
  "agent runner: the CLI receives the registry argv it is documented to get",
  posixOnly,
  () => {
    const dir = mkTmp();
    const argvFile = path.join(dir, "argv");
    // grok is the registry entry with an EMPTY headless-args array and a
    // --prompt-file handoff — the case an unguarded array expansion breaks.
    const grok = runAgent({
      args: ["grok", path.join(dir, "grok.md"), makePrompt(dir)],
      cwd: dir,
      bin: makeBin("grok"),
      config: writeConfig(dir, { agentTimeout: 10 }),
      fake: { CF_FAKE_ARGV_FILE: argvFile, CF_FAKE_OUT: "review" },
    });
    assert.equal(grok.status, 0, grok.stderr);
    const grokArgv = recordedArgv(argvFile);
    assert.deepEqual(grokArgv.slice(0, 3), [
      "--sandbox",
      "read-only",
      "--prompt-file",
    ]);
    assert.equal(grokArgv.length, 4, "exactly one prompt-file path follows");

    const claude = runAgent({
      args: ["claude", path.join(dir, "claude.md"), makePrompt(dir)],
      cwd: dir,
      bin: makeBin("claude"),
      config: writeConfig(dir, { agentTimeout: 10 }),
      fake: { CF_FAKE_ARGV_FILE: argvFile, CF_FAKE_OUT: "review" },
    });
    assert.equal(claude.status, 0, claude.stderr);
    assert.deepEqual(recordedArgv(argvFile), [
      "-p",
      "--permission-mode",
      "plan",
    ]);
  },
);

test(
  "agent runner: a real review is written and reported ok",
  posixOnly,
  () => {
    const dir = mkTmp();
    const bin = makeBin("claude");
    const result = path.join(dir, "reviews", "result.md");
    const res = runAgent({
      args: ["claude", result, makePrompt(dir)],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 10 }),
      fake: { CF_FAKE_OUT: "### 🚨 Critical Issues\nNone.\n" },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /^CF_AGENT=ok /m);
    assert.match(fs.readFileSync(result, "utf8"), /Critical Issues/);
  },
);

test(
  "agent runner: exit 0 with no output is never reported ok",
  posixOnly,
  () => {
    const dir = mkTmp();
    const bin = makeBin("claude");
    const result = path.join(dir, "result.md");
    // A leftover file from an earlier run must not be mistaken for this result.
    fs.writeFileSync(result, "STALE review from a previous run\n");
    const res = runAgent({
      args: ["claude", result, makePrompt(dir)],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 10 }),
    });
    assert.equal(res.status, 0);
    assert.doesNotMatch(res.stdout, /CF_AGENT=ok/);
    assert.match(res.stderr, /CF_AGENT=empty .*produced no output/);
    assert.equal(
      fs.readFileSync(result, "utf8"),
      "",
      "the result file is truncated before launch, so the stale review is gone",
    );
  },
);

test(
  "agent runner: a non-zero CLI exit propagates as an error",
  posixOnly,
  () => {
    const dir = mkTmp();
    const bin = makeBin("claude");
    const res = runAgent({
      args: ["claude", path.join(dir, "result.md"), makePrompt(dir)],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 10 }),
      fake: { CF_FAKE_EXIT: "3" },
    });
    assert.equal(res.status, 3);
    assert.match(res.stderr, /CF_AGENT=error claude exited 3/);
  },
);

test("agent runner: a signalled CLI surfaces as 128+N", posixOnly, () => {
  const dir = mkTmp();
  const bin = makeBin("claude");
  const res = runAgent({
    args: ["claude", path.join(dir, "result.md"), makePrompt(dir)],
    cwd: dir,
    bin,
    config: writeConfig(dir, { agentTimeout: 10 }),
    fake: { CF_FAKE_SIGNAL: "TERM" },
  });
  assert.equal(res.status, 143);
  assert.match(res.stderr, /CF_AGENT=error claude exited 143/);
});

test(
  "agent runner: a CLI past the deadline is killed and reported timeout",
  posixOnly,
  async () => {
    const dir = mkTmp();
    const bin = makeBin("claude");
    const pidFile = path.join(dir, "pid");
    const started = Date.now();
    const res = runAgent({
      args: ["claude", path.join(dir, "result.md"), makePrompt(dir)],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 1 }),
      fake: { CF_FAKE_SLEEP: "30", CF_FAKE_PID_FILE: pidFile },
    });
    const elapsed = Date.now() - started;
    assert.equal(res.status, 124);
    assert.match(res.stderr, /CF_AGENT=timeout claude exceeded 1s/);
    assert.ok(elapsed < 12000, `bounded by the deadline (took ${elapsed}ms)`);
    assert.ok(
      await waitForDead(readPid(pidFile), 3000),
      "the CLI process must not outlive its deadline",
    );
  },
);

test(
  "agent runner: the deadline comes from the merged local+global config",
  posixOnly,
  async () => {
    const dir = mkTmp();
    const bin = makeBin("claude");
    const pidFile = path.join(dir, "pid");
    // The local config sets review fields but no deadline: the global one
    // supplies it, and the runner must enforce that merged value.
    const config = path.join(dir, "config.json");
    fs.writeFileSync(
      config,
      JSON.stringify({ docsDir: "docs", review: { withCodex: false } }),
    );
    const res = runAgent({
      args: ["claude", path.join(dir, "result.md"), makePrompt(dir)],
      cwd: dir,
      bin,
      config,
      env: { HOME: makeHome({ agentTimeout: 1 }) },
      fake: { CF_FAKE_SLEEP: "30", CF_FAKE_PID_FILE: pidFile },
    });
    assert.equal(res.status, 124);
    assert.match(res.stderr, /CF_AGENT=timeout claude exceeded 1s/);
    assert.ok(
      await waitForDead(readPid(pidFile), 3000),
      "the CLI must not outlive the merged deadline",
    );
  },
);

test(
  "agent runner: a missing CLI degrades to unavailable",
  {
    skip:
      !POSIX || realCliOnSafePath("claude")
        ? "a real claude CLI is reachable on the minimal PATH"
        : false,
    timeout: 25000,
  },
  () => {
    const dir = mkTmp();
    const res = runAgent({
      args: ["claude", path.join(dir, "result.md"), makePrompt(dir)],
      cwd: dir,
      bin: mkTmp("cf-runners-emptybin-"),
      config: writeConfig(dir),
    });
    assert.equal(res.status, 127);
    assert.match(res.stderr, /CF_AGENT=unavailable/);
  },
);

test(
  "agent runner: an invalid agentTimeout fails before launch",
  posixOnly,
  () => {
    const dir = mkTmp();
    const bin = makeBin("claude");
    const argvFile = path.join(dir, "argv");
    const config = path.join(dir, "config.json");
    fs.writeFileSync(config, '{ "review": { "agentTimeout": "soon" } }');
    const res = runAgent({
      args: ["claude", path.join(dir, "result.md"), makePrompt(dir)],
      cwd: dir,
      bin,
      config,
      fake: { CF_FAKE_ARGV_FILE: argvFile },
    });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /CF_AGENT=error unusable review\.agentTimeout/);
    assert.equal(
      fs.existsSync(argvFile),
      false,
      "the CLI must never be launched without an enforceable deadline",
    );
  },
);

test("agent runner: an unknown flag is rejected", posixOnly, () => {
  const dir = mkTmp();
  const res = runAgent({
    args: ["claude", path.join(dir, "result.md"), "--bogus"],
    cwd: dir,
    bin: makeBin("claude"),
    config: writeConfig(dir),
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /CF_AGENT=error unknown flag: --bogus/);
});

test("agent runner: a result path containing spaces works", posixOnly, () => {
  const dir = mkTmp();
  const bin = makeBin("claude");
  const result = path.join(dir, "my reviews", "2026 result review.md");
  const res = runAgent({
    args: ["claude", result, makePrompt(dir)],
    cwd: dir,
    bin,
    config: writeConfig(dir, { agentTimeout: 10 }),
    fake: { CF_FAKE_OUT: "### 📋 Summary\nDUMMY_OK\n" },
  });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.trim(), `CF_AGENT=ok ${result}`);
  assert.match(fs.readFileSync(result, "utf8"), /DUMMY_OK/);
  assert.ok(
    fs.existsSync(path.join(dir, "my reviews", "2026 result review.log")),
    "the sidecar log lands next to the spaced result path",
  );
});

/* --- scope handoff ------------------------------------------------------- */

function writeSnapshot(dir, { complete = true, changes = true } = {}) {
  const snap = path.join(dir, "snapshot");
  fs.mkdirSync(snap, { recursive: true });
  fs.writeFileSync(
    path.join(snap, "diff.txt"),
    [
      "=== METADATA ===",
      `has_committed=${changes}`,
      "commit_range=",
      "has_uncommitted=false",
      "has_staged=false",
      "has_untracked=false",
      "base_branch=main",
      "current_branch=main",
      "head_sha=DUMMY_SHA",
      "scope_version=1",
      "scope_mode=legacy",
      "scope_range=",
      "scope_paths=0",
      `scope_complete=${complete}`,
      "files_total=1",
      "excluded_total=0",
      "snapshot_dir=",
      "=== END METADATA ===",
      "",
      "=== git diff main...HEAD (committed branch changes) ===",
      "DUMMY_SNAPSHOT_MARKER",
      "",
    ].join("\n"),
  );
  return snap;
}

test(
  "agent runner: --snapshot-dir reuses the captured scope",
  posixOnly,
  () => {
    // cwd is NOT a git repo: success proves the snapshot was used and gather-diff
    // was not re-run.
    const dir = mkTmp();
    const bin = makeBin("claude");
    const stdinFile = path.join(dir, "stdin");
    const res = runAgent({
      args: [
        "claude",
        path.join(dir, "result.md"),
        "--snapshot-dir",
        writeSnapshot(dir),
      ],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 10 }),
      fake: { CF_FAKE_OUT: "review", CF_FAKE_STDIN_FILE: stdinFile },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /CF_AGENT=ok/);
    assert.match(
      fs.readFileSync(stdinFile, "utf8"),
      /DUMMY_SNAPSHOT_MARKER/,
      "the prompt must be built from the snapshot the main agent captured",
    );
  },
);

test(
  "agent runner: an incomplete snapshot scope is flagged, not silently ok",
  posixOnly,
  () => {
    const dir = mkTmp();
    const bin = makeBin("claude");
    const stdinFile = path.join(dir, "stdin");
    const res = runAgent({
      args: [
        "claude",
        path.join(dir, "result.md"),
        "--snapshot-dir",
        writeSnapshot(dir, { complete: false }),
      ],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 10 }),
      fake: { CF_FAKE_OUT: "review", CF_FAKE_STDIN_FILE: stdinFile },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stderr, /CF_AGENT_SCOPE=incomplete/);
    assert.match(fs.readFileSync(stdinFile, "utf8"), /SCOPE INCOMPLETE/);
  },
);

test(
  "agent runner: an unusable snapshot is an error, never a re-gather",
  posixOnly,
  () => {
    const dir = mkTmp();
    const empty = path.join(dir, "nothing-here");
    fs.mkdirSync(empty);
    const argvFile = path.join(dir, "argv");
    const res = runAgent({
      args: ["claude", path.join(dir, "result.md"), "--snapshot-dir", empty],
      cwd: dir,
      bin: makeBin("claude"),
      config: writeConfig(dir),
      fake: { CF_FAKE_ARGV_FILE: argvFile },
    });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /CF_AGENT=error snapshot scope unusable/);
    assert.equal(fs.existsSync(argvFile), false);
  },
);

/* --- gather-diff exit codes (docs/later follow-up) ----------------------- */

function makeRepo() {
  const dir = mkTmp("cf-runners-repo-");
  const run = (args) => {
    const res = spawnSync("git", args, { cwd: dir, env: baseEnv });
    assert.equal(res.status, 0, `git ${args.join(" ")} failed`);
  };
  run(["init", "-q", "-b", "main"]);
  run(["config", "user.email", "test@example.invalid"]);
  run(["config", "user.name", "DUMMY_TESTER"]);
  fs.writeFileSync(path.join(dir, "a.txt"), "one\n");
  run(["add", "-A"]);
  run(["commit", "-qm", "init"]);
  return dir;
}

test(
  "agent runner: a structural scope failure fails the run (gather-diff exit 2)",
  posixOnly,
  () => {
    const dir = mkTmp(); // not a git repo → gather-diff exits 2
    const argvFile = path.join(dir, "argv");
    const res = runAgent({
      args: ["claude", path.join(dir, "result.md")],
      cwd: dir,
      bin: makeBin("claude"),
      config: writeConfig(dir),
      fake: { CF_FAKE_ARGV_FILE: argvFile },
    });
    assert.equal(res.status, 2, res.stderr);
    assert.match(res.stderr, /CF_AGENT=error scope collection failed/);
    assert.equal(
      fs.existsSync(argvFile),
      false,
      "a broken scope must never reach the agent as a reviewable diff",
    );
  },
);

test(
  "agent runner: an incomplete gathered scope proceeds but is marked (gather-diff exit 3)",
  {
    skip:
      !POSIX || process.getuid?.() === 0
        ? "needs a POSIX non-root user to make a file unreadable"
        : false,
    timeout: 25000,
  },
  () => {
    const dir = makeRepo();
    const secret = path.join(dir, "unreadable.txt");
    fs.writeFileSync(secret, "DUMMY_CONTENT\n");
    fs.chmodSync(secret, 0o000);
    const bin = makeBin("claude");
    const stdinFile = path.join(dir, "stdin");
    const res = runAgent({
      args: ["claude", path.join(dir, "result.md")],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 10 }),
      fake: { CF_FAKE_OUT: "review", CF_FAKE_STDIN_FILE: stdinFile },
    });
    fs.chmodSync(secret, 0o600);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stderr, /CF_AGENT_SCOPE=incomplete/);
    assert.match(fs.readFileSync(stdinFile, "utf8"), /SCOPE INCOMPLETE/);
  },
);

/* --- cancellation isolation --------------------------------------------- */

test(
  "agent runner: cancelling one run leaves a parallel run untouched",
  posixOnly,
  async () => {
    const dirA = mkTmp();
    const dirB = mkTmp();
    const bin = makeBin("claude");
    const pidA = path.join(dirA, "pid");
    const pidB = path.join(dirB, "pid");
    const resultB = path.join(dirB, "result.md");

    const spawnRun = (dir, pidFile, result, sleepSecs) =>
      spawn("bash", [agentScript, "claude", result, makePrompt(dir)], {
        cwd: dir,
        detached: true, // own process group, so we can cancel exactly one run
        env: {
          ...baseEnv,
          PATH: `${bin}:${SAFE_PATH}`,
          CF_CONFIG_FILE: writeConfig(dir, { agentTimeout: 30 }),
          CF_FAKE_PID_FILE: pidFile,
          CF_FAKE_SLEEP: sleepSecs,
          CF_FAKE_OUT: "### 📋 Summary\nDUMMY_B\n",
        },
        stdio: "ignore",
      });

    const a = spawnRun(dirA, pidA, path.join(dirA, "result.md"), "30");
    const b = spawnRun(dirB, pidB, resultB, "3");
    const exitB = new Promise((resolve) => b.on("exit", resolve));
    try {
      const childA = readPid(pidA);
      const childB = readPid(pidB);
      assert.ok(childA && childB, "both fake CLIs started");

      process.kill(-a.pid, "SIGTERM");

      assert.ok(
        await waitForDead(childA, 5000),
        "cancelling run A must cancel A's CLI, not orphan it",
      );
      assert.ok(isAlive(childB), "run B's CLI must be untouched by A's cancel");
      assert.equal(await exitB, 0, "run B still finishes normally");
      assert.match(fs.readFileSync(resultB, "utf8"), /DUMMY_B/);
    } finally {
      for (const child of [a, b]) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    }
  },
);

/* ---------------------------------------------------------------------------
 * run-codex-review.sh
 * ------------------------------------------------------------------------ */

function runCodex({ args, cwd, bin, fake = {}, config, timeout = 20000 }) {
  return spawnSync("bash", [codexScript, ...args], {
    cwd,
    env: {
      ...baseEnv,
      PATH: bin ? `${bin}:${SAFE_PATH}` : SAFE_PATH,
      CF_CONFIG_FILE: config ?? "",
      ...fake,
    },
    encoding: "utf8",
    timeout,
  });
}

/** The exact argv the fake CLI received — never inferred from documentation. */
function recordedArgv(file) {
  return fs.readFileSync(file, "utf8").trim().split("\n");
}

test(
  "codex runner: --uncommitted pins the scope in the real argv",
  posixOnly,
  () => {
    const dir = makeRepo();
    // A committed feature branch: auto-scope would choose --base main.
    spawnSync("git", ["checkout", "-qb", "feature"], {
      cwd: dir,
      env: baseEnv,
    });
    fs.writeFileSync(path.join(dir, "a.txt"), "two\n");
    spawnSync("git", ["commit", "-qam", "feature work"], {
      cwd: dir,
      env: baseEnv,
    });
    fs.writeFileSync(path.join(dir, "a.txt"), "three\n");

    const bin = makeBin("codex");
    const argvFile = path.join(dir, "argv");
    const forced = runCodex({
      args: [path.join(dir, "result.md"), "--uncommitted"],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 10 }),
      fake: {
        CF_FAKE_ARGV_FILE: argvFile,
        CF_FAKE_OUT: "[P2] DUMMY finding\n",
      },
    });
    assert.equal(forced.status, 0, forced.stderr);
    assert.deepEqual(recordedArgv(argvFile), ["review", "--uncommitted"]);

    const auto = runCodex({
      args: [path.join(dir, "result.md")],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 10 }),
      fake: {
        CF_FAKE_ARGV_FILE: argvFile,
        CF_FAKE_OUT: "[P2] DUMMY finding\n",
      },
    });
    assert.equal(auto.status, 0, auto.stderr);
    assert.deepEqual(
      recordedArgv(argvFile),
      ["review", "--base", "main"],
      "a direct no-arg invocation keeps the legacy auto-scope",
    );
  },
);

test("codex runner: an unknown flag is rejected", posixOnly, () => {
  const dir = makeRepo();
  const res = runCodex({
    args: [path.join(dir, "result.md"), "--everything"],
    cwd: dir,
    bin: makeBin("codex"),
    config: writeConfig(dir),
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /CF_CODEX=error unknown flag: --everything/);
});

test(
  "codex runner: a run past the deadline exits 124 with a timeout status",
  posixOnly,
  async () => {
    const dir = makeRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "changed\n");
    const bin = makeBin("codex");
    const pidFile = path.join(dir, "pid");
    const started = Date.now();
    const res = runCodex({
      args: [path.join(dir, "result.md"), "--uncommitted"],
      cwd: dir,
      bin,
      config: writeConfig(dir, { agentTimeout: 1 }),
      fake: { CF_FAKE_SLEEP: "30", CF_FAKE_PID_FILE: pidFile },
    });
    const elapsed = Date.now() - started;
    assert.equal(res.status, 124);
    assert.match(res.stderr, /CF_CODEX=timeout codex exceeded 1s/);
    assert.ok(elapsed < 12000, `bounded by the deadline (took ${elapsed}ms)`);
    assert.ok(
      await waitForDead(readPid(pidFile), 3000),
      "codex must not outlive its deadline",
    );
  },
);

test("codex runner: exit 0 with no output is not a review", posixOnly, () => {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, "a.txt"), "changed\n");
  const result = path.join(dir, "result.md");
  fs.writeFileSync(result, "STALE codex review\n");
  const res = runCodex({
    args: [result, "--uncommitted"],
    cwd: dir,
    bin: makeBin("codex"),
    config: writeConfig(dir, { agentTimeout: 10 }),
  });
  assert.equal(res.status, 0);
  assert.doesNotMatch(res.stdout, /CF_CODEX=ok/);
  assert.match(res.stderr, /CF_CODEX=empty codex produced no output/);
  assert.equal(fs.readFileSync(result, "utf8"), "");
});

test(
  "codex runner: a missing codex binary degrades to unavailable",
  {
    skip:
      !POSIX || realCliOnSafePath("codex")
        ? "a real codex CLI is reachable on the minimal PATH"
        : false,
    timeout: 25000,
  },
  () => {
    const dir = makeRepo();
    const res = runCodex({
      args: [path.join(dir, "result.md")],
      cwd: dir,
      bin: mkTmp("cf-runners-emptybin-"),
      config: writeConfig(dir),
    });
    assert.equal(res.status, 127);
    assert.match(res.stderr, /CF_CODEX=unavailable/);
  },
);
