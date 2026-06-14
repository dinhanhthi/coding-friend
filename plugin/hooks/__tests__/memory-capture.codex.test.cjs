"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../memory-capture.codex.sh");
const PLUGIN_ROOT = path.resolve(__dirname, "../..");

function makeProject() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-codex-memory-"));
  fs.mkdirSync(path.join(cwd, ".coding-friend"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".coding-friend", "config.json"),
    JSON.stringify({ memory: { autoCapture: true } }),
  );
  return cwd;
}

function writeTranscript(filePath, sessionId) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    [
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: sessionId,
          cwd: "/repo",
          timestamp: "2026-06-09T18:00:00Z",
        },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Implement Codex lifecycle command support",
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "Added host-specific CLI branches and TOML helpers.",
            },
          ],
        },
      }),
      "",
    ].join("\n"),
  );
}

function runHook(cwd, payload, env = {}) {
  execFileSync("bash", [SCRIPT], {
    cwd,
    input: JSON.stringify({ cwd, ...payload }),
    encoding: "utf8",
    timeout: 5000,
    env: {
      ...process.env,
      PLUGIN_ROOT,
      ...env,
    },
  });
}

function memoryFiles(cwd) {
  const dir = path.join(cwd, "docs", "memory", "bugs");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".md"));
}

describe("memory-capture.codex.sh", () => {
  it("writes an episode memory from transcript_path", () => {
    const cwd = makeProject();
    const sessionId = "codex-memory-direct";
    const transcript = path.join(cwd, "session.jsonl");
    try {
      writeTranscript(transcript, sessionId);
      runHook(cwd, { session_id: sessionId, transcript_path: transcript });

      const files = memoryFiles(cwd);
      expect(files).toHaveLength(1);
      const content = fs.readFileSync(
        path.join(cwd, "docs", "memory", "bugs", files[0]),
        "utf8",
      );
      expect(content).toContain("type: episode");
      expect(content).toContain("source: auto-capture");
      expect(content).toContain("Implement Codex lifecycle command support");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("finds a Codex transcript by session_id when transcript_path is missing", () => {
    const cwd = makeProject();
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "cf-codex-home-"));
    const sessionId = "codex-memory-fallback";
    const transcript = path.join(
      codexHome,
      "sessions",
      "2026",
      "06",
      "09",
      "session.jsonl",
    );
    try {
      writeTranscript(transcript, sessionId);
      runHook(cwd, { session_id: sessionId }, { CODEX_HOME: codexHome });

      const files = memoryFiles(cwd);
      expect(files).toHaveLength(1);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(codexHome, { recursive: true, force: true });
    }
  });
});
