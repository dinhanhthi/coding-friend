import { expect, mock, test } from "claude-code/testing";

const ROOT = "/repo";
const PLANS = `${ROOT}/docs/plans`;

const RUNNING = `---
slug: p-run
status: in-progress
---

# Plan

| Status | Phase | File |
| --- | --- | --- |
| ✅ DONE | Phase 1: base | [phase-1-base.md](./phase-1-base.md) |
| 🔄 IN PROGRESS | Phase 2: ui | [phase-2-ui.md](./phase-2-ui.md) |
`;

const FILES: Record<string, string> = {
  [`${PLANS}/p-old/README.md`]:
    "---\nstatus: done\n---\n\n| Status | Task |\n| --- | --- |\n| ✅ DONE | old |\n",
  [`${PLANS}/p-run/README.md`]: RUNNING,
  [`${PLANS}/p-run/phase-1-base.md`]:
    "| Status | Task |\n| --- | --- |\n| ✅ DONE | 1.1 base |\n",
  [`${PLANS}/p-run/phase-2-ui.md`]:
    "| Status | Task |\n| --- | --- |\n| ✅ DONE | 2.1 a |\n| 🔄 IN PROGRESS | 2.2 b |\n| ⬜ TODO | 2.3 c |\n",
};

// The newer plan is done: the running one must still win.
const MTIME: Record<string, number> = {
  [`${PLANS}/p-old/README.md`]: 2_000,
  [`${PLANS}/p-run/README.md`]: 1_000,
};

// How the person runs it: typed at the prompt of a fullscreen terminal.
const RUN = {
  command: "cf-plan-status",
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
} as const;

function entry(name: string, kind: "file" | "dir", size = 0) {
  return { name, kind, size, mtimeMs: 0, isLink: false };
}

test("/cf-plan-status shows the running plan; a bad slug reads nothing", async ($, on) => {
  // The engine beneath the mod: a project at /repo with two plans, an
  // in-memory state, and a pane that opens.
  mock.clock(on, { now: 5_000 });
  const state = new Map<string, unknown>();
  let version = 0;
  on("state.set", (_, e) => {
    const w = e as { key?: string; value?: unknown };
    state.set(String(w.key), w.value);
    version += 1;
    return { value: { isSet: true, version } };
  });
  on("state.get", (_, e) => {
    const w = e as { key?: string };
    return { value: { value: state.get(String(w.key)), version } };
  });
  on("command.register", () => ({ value: { command: "cf-plan-status" } }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("session.root", () => ({ value: ROOT }));
  const reads: string[] = [];
  on("fs.list", (_, e) => {
    if (e.path === PLANS) {
      return {
        value: [
          entry("p-old", "dir"),
          entry("p-run", "dir"),
          entry("notes.md", "file", 10),
        ],
      };
    }
    if (e.path === `${PLANS}/p-run`) {
      return {
        value: [
          entry("README.md", "file", 300),
          entry("phase-2-ui.md", "file", 100),
          entry("phase-1-base.md", "file", 60),
        ],
      };
    }
    return { deny: "no such directory" };
  });
  on("fs.stat", (_, e) => {
    const text = FILES[e.path];
    if (text === undefined) return { deny: "ENOENT" };
    return {
      value: {
        kind: "file",
        size: text.length,
        mtimeMs: MTIME[e.path] ?? 0,
        isLink: false,
      },
    };
  });
  on("fs.read", (_, e) => {
    reads.push(e.path);
    const text = FILES[e.path];
    return text === undefined ? { deny: "ENOENT" } : { value: text };
  });
  const opened: string[] = [];
  on("ui.open", (_, e) => {
    opened.push(`${e.id}:${e.title}`);
    return { value: { isPlaced: true } };
  });

  await $.session.start({
    cwd: ROOT,
    surface: "terminal",
    isInteractive: true,
  });

  const out = await $.command.run({ ...RUN, args: "" });
  expect(out.text).toBe(
    "Plan p-run (in-progress): phases 1/2 done, tasks 2/4 done",
  );
  expect(opened).toEqual(["cf-plan-status:Plan: p-run"]);
  const plan = state.get("plan") as {
    slug: string;
    groups: { title: string; rows: { status: string; label: string }[] }[];
  };
  expect(plan.slug).toBe("p-run");
  // README rows, then only the phase file not yet all done.
  expect(plan.groups.map((g) => g.title)).toEqual(["Progress", "phase-2-ui"]);
  expect(plan.groups[1]?.rows[1]).toEqual({
    status: "in_progress",
    label: "2.2 b",
  });

  const ui = await $.ui.mount({
    plugin: "coding-friend-mods",
    component: "Pane",
    requestId: "cf-plan-status",
    surface: "terminal",
    props: {
      title: "Plan: p-run",
      isFocused: false,
      bodyColumns: 40,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 20 },
      view: {},
    },
  });
  expect((await ui.find({ type: "Text", text: /2\.2 b/ }))?.text).toBe(
    "▸ 2.2 b",
  );
  await ui.unmount();

  reads.length = 0;
  const bad = await $.command.run({ ...RUN, args: "../secret" });
  expect(bad.text).toBe(
    'Not a plan slug: "/cf-plan-status [slug]" takes a folder name in docs/plans',
  );
  expect(reads).toEqual([]);
  expect(opened.length).toBe(1);
});
