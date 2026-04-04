"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const AGENT_TRACKER = path.resolve(__dirname, "../agent-tracker.sh");
const TASK_TRACKER = path.resolve(__dirname, "../task-tracker.sh");
const SESSION_LOG = path.resolve(__dirname, "../session-log.sh");

const SESSION_ID = `test-tracking-${process.pid}`;

/** Run a shell hook with JSON stdin. Returns stdout (empty for async hooks). */
function runHook(script, jsonInput) {
  const input =
    typeof jsonInput === "string" ? jsonInput : JSON.stringify(jsonInput);
  try {
    return execFileSync("bash", [script], {
      input,
      encoding: "utf8",
      timeout: 5000,
    });
  } catch {
    return "";
  }
}

function cleanup() {
  const patterns = [
    `/tmp/cf-agent-${SESSION_ID}`,
    `/tmp/cf-agent-count-${SESSION_ID}`,
    `/tmp/cf-tasks-${SESSION_ID}.json`,
    `/tmp/cf-tasks-${SESSION_ID}.lock`,
    `/tmp/cf-session-${SESSION_ID}.jsonl`,
    `/tmp/cf-session-turn-${SESSION_ID}`,
  ];
  for (const p of patterns) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    try {
      fs.rmdirSync(p);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// agent-tracker.sh
// ---------------------------------------------------------------------------

describe("agent-tracker.sh", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("writes agent name on SubagentStart", () => {
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStart",
      agent_type: "cf-reviewer-security",
      session_id: SESSION_ID,
    });

    const agentFile = `/tmp/cf-agent-${SESSION_ID}`;
    expect(fs.existsSync(agentFile)).toBe(true);
    expect(fs.readFileSync(agentFile, "utf8").trim()).toBe(
      "cf-reviewer-security",
    );
  });

  it("clears agent file on SubagentStop when no other agents running", () => {
    // Start one agent
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStart",
      agent_type: "cf-reviewer",
      session_id: SESSION_ID,
    });
    // Stop it
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStop",
      agent_type: "cf-reviewer",
      session_id: SESSION_ID,
    });

    const agentFile = `/tmp/cf-agent-${SESSION_ID}`;
    expect(fs.existsSync(agentFile)).toBe(false);
  });

  it("does NOT clear agent file when parallel agents still running", () => {
    // Start agent A
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStart",
      agent_type: "cf-reviewer-security",
      session_id: SESSION_ID,
    });
    // Start agent B
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStart",
      agent_type: "cf-reviewer-quality",
      session_id: SESSION_ID,
    });
    // Stop agent A — agent B still running
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStop",
      agent_type: "cf-reviewer-security",
      session_id: SESSION_ID,
    });

    const agentFile = `/tmp/cf-agent-${SESSION_ID}`;
    expect(fs.existsSync(agentFile)).toBe(true);
  });

  it("clears agent file when last parallel agent stops", () => {
    // Start A and B
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStart",
      agent_type: "cf-reviewer-security",
      session_id: SESSION_ID,
    });
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStart",
      agent_type: "cf-reviewer-quality",
      session_id: SESSION_ID,
    });
    // Stop both
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStop",
      agent_type: "cf-reviewer-security",
      session_id: SESSION_ID,
    });
    runHook(AGENT_TRACKER, {
      hook_event_name: "SubagentStop",
      agent_type: "cf-reviewer-quality",
      session_id: SESSION_ID,
    });

    const agentFile = `/tmp/cf-agent-${SESSION_ID}`;
    expect(fs.existsSync(agentFile)).toBe(false);
  });

  it("exits silently with no session_id", () => {
    runHook(AGENT_TRACKER, { hook_event_name: "SubagentStart" });
    // Should not create any file
    expect(fs.existsSync(`/tmp/cf-agent-${SESSION_ID}`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// task-tracker.sh
// ---------------------------------------------------------------------------

describe("task-tracker.sh", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("increments total on TaskCreated", () => {
    runHook(TASK_TRACKER, {
      hook_event_name: "TaskCreated",
      session_id: SESSION_ID,
    });

    const tasksFile = `/tmp/cf-tasks-${SESSION_ID}.json`;
    expect(fs.existsSync(tasksFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(tasksFile, "utf8"));
    expect(data.total).toBe(1);
    expect(data.completed).toBe(0);
  });

  it("increments completed on TaskCompleted", () => {
    runHook(TASK_TRACKER, {
      hook_event_name: "TaskCreated",
      session_id: SESSION_ID,
    });
    runHook(TASK_TRACKER, {
      hook_event_name: "TaskCompleted",
      session_id: SESSION_ID,
    });

    const data = JSON.parse(
      fs.readFileSync(`/tmp/cf-tasks-${SESSION_ID}.json`, "utf8"),
    );
    expect(data.total).toBe(1);
    expect(data.completed).toBe(1);
  });

  it("handles multiple tasks", () => {
    for (let i = 0; i < 3; i++) {
      runHook(TASK_TRACKER, {
        hook_event_name: "TaskCreated",
        session_id: SESSION_ID,
      });
    }
    runHook(TASK_TRACKER, {
      hook_event_name: "TaskCompleted",
      session_id: SESSION_ID,
    });

    const data = JSON.parse(
      fs.readFileSync(`/tmp/cf-tasks-${SESSION_ID}.json`, "utf8"),
    );
    expect(data.total).toBe(3);
    expect(data.completed).toBe(1);
  });

  it("exits silently with no session_id", () => {
    runHook(TASK_TRACKER, { hook_event_name: "TaskCreated" });
    expect(fs.existsSync(`/tmp/cf-tasks-${SESSION_ID}.json`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// session-log.sh
// ---------------------------------------------------------------------------

describe("session-log.sh", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("appends a JSON line with turn number and timestamp", () => {
    runHook(SESSION_LOG, {
      stop_reason: "end_turn",
      session_id: SESSION_ID,
    });

    const logFile = `/tmp/cf-session-${SESSION_ID}.jsonl`;
    expect(fs.existsSync(logFile)).toBe(true);

    const line = JSON.parse(fs.readFileSync(logFile, "utf8").trim());
    expect(line.turn).toBe(1);
    expect(line.stop_reason).toBe("end_turn");
    expect(line.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("increments turn number on subsequent calls", () => {
    runHook(SESSION_LOG, { stop_reason: "end_turn", session_id: SESSION_ID });
    runHook(SESSION_LOG, { stop_reason: "tool_use", session_id: SESSION_ID });

    const lines = fs
      .readFileSync(`/tmp/cf-session-${SESSION_ID}.jsonl`, "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);

    expect(lines).toHaveLength(2);
    expect(lines[0].turn).toBe(1);
    expect(lines[1].turn).toBe(2);
    expect(lines[1].stop_reason).toBe("tool_use");
  });

  it("exits silently with no session_id", () => {
    runHook(SESSION_LOG, { stop_reason: "end_turn" });
    expect(fs.existsSync(`/tmp/cf-session-${SESSION_ID}.jsonl`)).toBe(false);
  });
});
