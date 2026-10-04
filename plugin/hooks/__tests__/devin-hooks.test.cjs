"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOOKS_DIR = path.resolve(__dirname, "..");
const PLUGIN_ROOT = path.resolve(__dirname, "../..");
const BLOCK_ADAPTER = path.join(HOOKS_DIR, "block-adapter.devin.sh");
const RULES_REMINDER = path.join(HOOKS_DIR, "rules-reminder.devin.sh");
const MEMORY_CAPTURE = path.join(HOOKS_DIR, "memory-capture.devin.sh");

function runBash(script, args, { cwd, input, env } = {}) {
  try {
    const stdout = execFileSync("bash", [script, ...args], {
      cwd,
      input,
      encoding: "utf8",
      timeout: 10000,
      env: env || process.env,
    });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || "" };
  }
}

/** Temp plugin root with a hooks/ dir of fixture inner scripts. */
function makeFixturePluginRoot(scripts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cf-devin-plugin-"));
  const hooks = path.join(root, "hooks");
  fs.mkdirSync(hooks, { recursive: true });
  for (const [name, body] of Object.entries(scripts)) {
    const p = path.join(hooks, name);
    fs.writeFileSync(p, body);
    fs.chmodSync(p, 0o755);
  }
  return root;
}

let fixtureSeq = 0;
function uniqueSessionId(tag) {
  fixtureSeq += 1;
  return `devin-test-${process.pid}-${Date.now()}-${fixtureSeq}-${tag}`;
}

describe("block-adapter.devin.sh", () => {
  it("translates inner exit 2 + Claude JSON into top-level block decision", () => {
    const root = makeFixturePluginRoot({
      "fake-block.sh": `#!/usr/bin/env bash
cat >/dev/null
cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Access blocked by fixture"}}
EOF
exit 2
`,
    });
    try {
      const res = runBash(BLOCK_ADAPTER, ["fake-block.sh"], {
        input: JSON.stringify({ tool_name: "read", tool_input: {} }),
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: root },
      });
      expect(res.status).toBe(2);
      const json = JSON.parse(res.stdout.trim());
      expect(json).toEqual({
        decision: "block",
        reason: "Access blocked by fixture",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("extracts reason from nested hookSpecificOutput decision+reason", () => {
    const root = makeFixturePluginRoot({
      "fake-scout.sh": `#!/usr/bin/env bash
cat >/dev/null
echo '{"hookSpecificOutput":{"decision":"block","reason":"ignore pattern hit"}}'
exit 2
`,
    });
    try {
      const res = runBash(BLOCK_ADAPTER, ["fake-scout.sh"], {
        input: "{}",
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: root },
      });
      expect(res.status).toBe(2);
      expect(JSON.parse(res.stdout.trim()).reason).toBe("ignore pattern hit");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes inner stdout through verbatim on exit 0", () => {
    const root = makeFixturePluginRoot({
      "fake-allow.sh": `#!/usr/bin/env bash
cat >/dev/null
echo '{"some":"inner-output"}'
exit 0
`,
    });
    try {
      const res = runBash(BLOCK_ADAPTER, ["fake-allow.sh"], {
        input: "{}",
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: root },
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toBe('{"some":"inner-output"}');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints {} and exits 0 when the inner script is missing (fail open)", () => {
    const root = makeFixturePluginRoot({});
    try {
      const res = runBash(BLOCK_ADAPTER, ["does-not-exist.sh"], {
        input: "{}",
        env: { ...process.env, CLAUDE_PLUGIN_ROOT: root },
      });
      expect(res.status).toBe(0);
      expect(res.stdout.trim()).toBe("{}");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("adapts the real privacy-block.sh on a sensitive file_path", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-devin-cwd-"));
    try {
      const env = { ...process.env };
      delete env.CLAUDE_PLUGIN_ROOT;
      const res = runBash(BLOCK_ADAPTER, ["privacy-block.sh"], {
        cwd,
        input: JSON.stringify({
          hook_event_name: "PreToolUse",
          session_id: uniqueSessionId("privacy"),
          tool_name: "read",
          tool_input: { file_path: "/tmp/x/.env" },
        }),
        env,
      });
      expect(res.status).toBe(2);
      const json = JSON.parse(res.stdout.trim());
      expect(json.decision).toBe("block");
      expect(json.reason).toContain("privacy-block");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("rules-reminder.devin.sh", () => {
  function makeProjectWithConfig(config) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-devin-cwd-"));
    if (config) {
      fs.mkdirSync(path.join(cwd, ".coding-friend"), { recursive: true });
      fs.writeFileSync(
        path.join(cwd, ".coding-friend", "config.json"),
        JSON.stringify(config),
      );
    }
    return cwd;
  }

  it("emits JSON additionalContext on the first prompt", () => {
    const cwd = makeProjectWithConfig(null);
    const sessionId = uniqueSessionId("rr1");
    try {
      const env = { ...process.env };
      delete env.CLAUDE_PLUGIN_ROOT;
      const res = runBash(RULES_REMINDER, [], {
        cwd,
        input: JSON.stringify({
          hook_event_name: "UserPromptSubmit",
          session_id: sessionId,
          prompt: "hello",
        }),
        env,
      });
      expect(res.status).toBe(0);
      const json = JSON.parse(res.stdout.trim());
      expect(json.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
      expect(json.hookSpecificOutput.additionalContext).toContain(
        "<system-reminder>",
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(`/tmp/cf-rules-reminder-${sessionId}`, { force: true });
    }
  });

  it("emits nothing on the second prompt (counter 2)", () => {
    const cwd = makeProjectWithConfig(null);
    const sessionId = uniqueSessionId("rr2");
    try {
      const env = { ...process.env };
      delete env.CLAUDE_PLUGIN_ROOT;
      const input = JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: sessionId,
        prompt: "hello",
      });
      const first = runBash(RULES_REMINDER, [], { cwd, input, env });
      expect(first.status).toBe(0);
      expect(first.stdout.trim()).not.toBe("");

      const second = runBash(RULES_REMINDER, [], { cwd, input, env });
      expect(second.status).toBe(0);
      expect(second.stdout.trim()).toBe("");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(`/tmp/cf-rules-reminder-${sessionId}`, { force: true });
    }
  });

  it("injects deferred memory-capture text when the marker exists", () => {
    const cwd = makeProjectWithConfig({ memory: { autoCapture: true } });
    const markerDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "cf-devin-markers-"),
    );
    const sessionId = uniqueSessionId("rr3");
    // Burn the first reminder so this prompt exercises capture-only injection
    fs.writeFileSync(`/tmp/cf-rules-reminder-${sessionId}`, "1");
    fs.writeFileSync(
      path.join(markerDir, `cf-devin-compacted-${sessionId}`),
      "",
    );
    try {
      const env = { ...process.env, CF_DEVIN_MARKER_DIR: markerDir };
      delete env.CLAUDE_PLUGIN_ROOT;
      const res = runBash(RULES_REMINDER, [], {
        cwd,
        input: JSON.stringify({
          hook_event_name: "UserPromptSubmit",
          session_id: sessionId,
          prompt: "next",
        }),
        env,
      });
      expect(res.status).toBe(0);
      const json = JSON.parse(res.stdout.trim());
      const ctx = json.hookSpecificOutput.additionalContext;
      expect(ctx).toContain("Context was just compacted");
      expect(ctx).toContain("memory_store");
      expect(ctx).not.toContain("Before context is compacted");
      expect(
        fs.existsSync(
          path.join(markerDir, `cf-devin-compacted-${sessionId}`),
        ),
      ).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(markerDir, { recursive: true, force: true });
      fs.rmSync(`/tmp/cf-rules-reminder-${sessionId}`, { force: true });
    }
  });

  it("emits nothing when marker exists but autoCapture is disabled", () => {
    const cwd = makeProjectWithConfig(null);
    const markerDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "cf-devin-markers-"),
    );
    const sessionId = uniqueSessionId("rr4");
    fs.writeFileSync(`/tmp/cf-rules-reminder-${sessionId}`, "1");
    fs.writeFileSync(
      path.join(markerDir, `cf-devin-compacted-${sessionId}`),
      "",
    );
    try {
      const env = { ...process.env, CF_DEVIN_MARKER_DIR: markerDir };
      delete env.CLAUDE_PLUGIN_ROOT;
      const res = runBash(RULES_REMINDER, [], {
        cwd,
        input: JSON.stringify({
          hook_event_name: "UserPromptSubmit",
          session_id: sessionId,
          prompt: "next",
        }),
        env,
      });
      expect(res.status).toBe(0);
      expect(res.stdout.trim()).toBe("");
      expect(
        fs.existsSync(
          path.join(markerDir, `cf-devin-compacted-${sessionId}`),
        ),
      ).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(markerDir, { recursive: true, force: true });
      fs.rmSync(`/tmp/cf-rules-reminder-${sessionId}`, { force: true });
    }
  });
});

describe("memory-capture.devin.sh", () => {
  it("writes a marker keyed by session_id and prints nothing", () => {
    const markerDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "cf-devin-markers-"),
    );
    const sessionId = uniqueSessionId("mc1");
    try {
      const env = { ...process.env, CF_DEVIN_MARKER_DIR: markerDir };
      const res = runBash(MEMORY_CAPTURE, [], {
        input: JSON.stringify({
          hook_event_name: "PostCompaction",
          session_id: sessionId,
          summary: "see ~/.local/share/devin/cli/summaries/history_ab.md",
        }),
        env,
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toBe("");
      expect(
        fs.existsSync(
          path.join(markerDir, `cf-devin-compacted-${sessionId}`),
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(markerDir, { recursive: true, force: true });
    }
  });

  it("falls back to the 'default' session key without session_id", () => {
    const markerDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "cf-devin-markers-"),
    );
    try {
      const env = { ...process.env, CF_DEVIN_MARKER_DIR: markerDir };
      const res = runBash(MEMORY_CAPTURE, [], {
        input: JSON.stringify({ hook_event_name: "PostCompaction" }),
        env,
      });
      expect(res.status).toBe(0);
      expect(
        fs.existsSync(path.join(markerDir, "cf-devin-compacted-default")),
      ).toBe(true);
    } finally {
      fs.rmSync(markerDir, { recursive: true, force: true });
    }
  });
});
