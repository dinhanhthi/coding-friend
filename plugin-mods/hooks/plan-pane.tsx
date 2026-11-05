import { atom, read, update } from "claude-code";
import type { EngineInterface, On } from "claude-code";

import type {
  ModsPlan,
  ModsPlanCounts,
  ModsPlanGroup,
  ModsPlanRow,
} from "../types";
import {
  parseFrontmatter,
  parseProgress,
  pickActivePlan,
  summarize,
} from "./lib/plan.mjs";
import { isInteractive } from "./register";
import type { ModsContext } from "./register";

// `/cf-plan-status [slug]`: a pane with the Progress tables of one plan in
// docs/plans/. It opens only when the person runs the command, then redraws
// when a file of that plan is edited and after each turn, while it is open.
// Plan files are untrusted text: plan.mjs extracts and cuts the labels, the
// pane only draws them, and the command's text (which the model reads) holds
// only the slug, the status word and counts.

const PANE = "cf-plan-status";

/** Plan folder names and the slug argument; never "." or "..". */
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
/** A frontmatter status worth showing (in-progress, done, failed …). */
const STATUS_WORD_RE = /^[a-z][a-z-]{0,30}$/;
const PHASE_FILE_RE = /^phase-(\d{1,4})[A-Za-z0-9._-]{0,100}\.md$/;

const MAX_BYTES = 256 * 1024;
const MAX_PHASE_FILES = 20;
const MAX_PLANS = 200;
const MAX_ROWS = 60;

const BAD_SLUG =
  'Not a plan slug: "/cf-plan-status [slug]" takes a folder name in docs/plans';

const planState = atom(
  { plugin: "coding-friend-mods", key: "plan" } as const,
  null,
);

/** Called by register.tsx's session.start, which owns that event. */
export async function registerPlanCommand($: EngineInterface): Promise<void> {
  await $.command.register({
    // Literal here and in the command.run matcher: validate then reads that
    // hook as answering its own command (it does not resolve PANE).
    name: "cf-plan-status",
    description: "Show Coding Friend plan progress",
    argumentHint: "[slug]",
  });
}

export function registerPlanPane(on: On, _ctx: ModsContext): void {
  // Answers its own command: never reads next, so no .catch passing it on.
  // The matcher is a literal (see registerPlanCommand).
  on("command.run", { command: "cf-plan-status" }, async ($, e) => {
    try {
      return { text: await runCommand($, e.args) };
    } catch {
      return { text: "cf-plan-status: could not read docs/plans" };
    }
  });

  on(
    "ui.render",
    { component: "Pane", requestId: PANE },
    async ($, e, next) => {
      try {
        const { Box, Text } = $.ui.resolve(e);
        const plan = await read($, planState);
        if (!plan) {
          return <Text dimColor>No plan loaded. Run /cf-plan-status.</Text>;
        }
        return (
          <Box flexDirection="column">
            <Text bold>
              {plan.slug}
              {plan.status ? ` · ${plan.status}` : ""}
            </Text>
            <Text dimColor>{countsLine(plan)}</Text>
            {plan.groups.map((group) => (
              <Box flexDirection="column" marginTop={1}>
                <Text bold>{group.title}</Text>
                {group.rows.map((row) => (
                  <Text color={ROW_COLOR[row.status]}>
                    {ROW_ICON[row.status]} {row.label}
                  </Text>
                ))}
              </Box>
            ))}
          </Box>
        );
      } catch {
        return next(e);
      }
    },
  );

  // A file of the shown plan was edited: read the plan again.
  on("tool.call", { tool: /^(Edit|Write|MultiEdit)$/ }, async ($, e, next) => {
    const ran = await next(e);
    try {
      if (ran.deny === undefined && ran.isError !== true) {
        const path = (e as { file_path?: unknown }).file_path;
        if (typeof path === "string") await refresh($, path);
      }
    } catch {
      // Fail-soft: the pane keeps what it drew.
    }
    return ran;
  }).catch(($, e, next) => next(e));

  // Plans also change by other means (a Bash `mv`, git): read again after
  // each main-loop turn while the pane is open.
  on("turn.complete", async ($, e, next) => {
    const done = await next(e);
    try {
      if (e.agentId === undefined) await refresh($, null);
    } catch {
      // Fail-soft.
    }
    return done;
  }).catch(($, e, next) => next(e));

  on("ui.close", { id: PANE }, async ($, e, next) => {
    // Always next(e): a hook answering alone would keep the pane open.
    const closed = await next(e);
    try {
      await update($, planState, () => null);
    } catch {
      // Fail-soft: the next command overwrites it.
    }
    return closed;
  }).catch(($, e, next) => next(e));
}

const ROW_ICON: Record<ModsPlanRow["status"], string> = {
  done: "✓",
  in_progress: "▸",
  todo: "·",
  failed: "✗",
};

const ROW_COLOR: Record<ModsPlanRow["status"], string | undefined> = {
  done: "success",
  in_progress: "warning",
  todo: undefined,
  failed: "error",
};

async function runCommand($: EngineInterface, args: string): Promise<string> {
  const arg = args.trim();
  if (arg !== "" && !isSlug(arg)) return BAD_SLUG;
  const root = await $.session.root();
  let slug = arg;
  if (slug === "") {
    const picked = pickActivePlan(await listPlans($, root));
    if (!picked) return "No plans found in docs/plans";
    slug = picked.slug;
  }
  const plan = await readPlan($, root, slug);
  if (!plan) return `No plan "${slug}" in docs/plans`;
  if (await isInteractive($)) {
    await update($, planState, () => plan);
    await $.ui.open({ id: PANE, title: `Plan: ${slug}` });
  }
  return summaryText(plan);
}

/** Read the shown plan again when the pane is open and `path` is one of its files (null: any). */
async function refresh($: EngineInterface, path: string | null): Promise<void> {
  const shown = await read($, planState);
  if (!shown) return;
  if (
    path !== null &&
    !path.replace(/\\/g, "/").includes(`/docs/plans/${shown.slug}/`)
  ) {
    return;
  }
  const panes = await $.ui.panes();
  if (!panes.some((pane) => pane.id === PANE)) {
    await update($, planState, () => null);
    return;
  }
  const plan = await readPlan($, await $.session.root(), shown.slug);
  if (plan) await update($, planState, () => plan);
}

function isSlug(name: string): boolean {
  return SLUG_RE.test(name) && !name.includes("..");
}

function plansDir(root: string): string {
  return `${root.replace(/[\\/]+$/, "")}/docs/plans`;
}

/**
 * A file's text when it is a regular file (not a symbolic link) of at most
 * MAX_BYTES, else null.
 */
async function readCapped(
  $: EngineInterface,
  path: string,
): Promise<{ text: string; mtimeMs: number } | null> {
  try {
    const stat = await $.fs.stat(path);
    if (stat.isLink || stat.kind !== "file" || stat.size > MAX_BYTES) {
      return null;
    }
    return { text: await $.fs.read(path), mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

/** Plan folders (no symbolic links) under docs/plans/ that hold a README.md. */
async function listPlans($: EngineInterface, root: string) {
  const dir = plansDir(root);
  let entries: Awaited<ReturnType<EngineInterface["fs"]["list"]>> = [];
  try {
    entries = await $.fs.list(dir);
  } catch {
    return [];
  }
  const names = entries
    .filter(
      (entry) => entry.kind === "dir" && !entry.isLink && isSlug(entry.name),
    )
    .map((entry) => entry.name)
    .slice(0, MAX_PLANS);
  const plans = [];
  for (const slug of names) {
    const readme = await readCapped($, `${dir}/${slug}/README.md`);
    if (readme === null) continue;
    plans.push({
      slug,
      frontmatter: parseFrontmatter(readme.text),
      mtimeMs: readme.mtimeMs,
    });
  }
  return plans;
}

/** Whether docs/plans/<slug> is a real folder, not a symbolic link. */
async function isPlanDir($: EngineInterface, root: string, slug: string) {
  try {
    const entries = await $.fs.list(plansDir(root));
    return entries.some(
      (entry) => entry.name === slug && entry.kind === "dir" && !entry.isLink,
    );
  } catch {
    return false;
  }
}

/** README.md and the phase files of one plan, as the pane shows them. */
async function readPlan(
  $: EngineInterface,
  root: string,
  slug: string,
): Promise<ModsPlan | null> {
  if (!(await isPlanDir($, root, slug))) return null;
  const dir = `${plansDir(root)}/${slug}`;
  const readme = await readCapped($, `${dir}/README.md`);
  if (readme === null) return null;
  const frontmatter = parseFrontmatter(readme.text);
  const readmeRows = parseProgress(readme.text);

  let entries: Awaited<ReturnType<EngineInterface["fs"]["list"]>> = [];
  try {
    entries = await $.fs.list(dir);
  } catch {
    entries = [];
  }
  const phaseFiles = entries
    .filter(
      (entry) =>
        entry.kind === "file" &&
        !entry.isLink &&
        PHASE_FILE_RE.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort(byPhaseNumber)
    .slice(0, MAX_PHASE_FILES);

  const groups: ModsPlanGroup[] = [{ title: "Progress", rows: readmeRows }];
  const taskRows: ModsPlanRow[] = [];
  for (const name of phaseFiles) {
    // Stat and size checked again at read time: the entry may have changed.
    const phase = await readCapped($, `${dir}/${name}`);
    if (phase === null) continue;
    const rows: ModsPlanRow[] = parseProgress(phase.text);
    taskRows.push(...rows);
    // A phase all done or all to do is its README row already.
    const isActive =
      rows.some(
        (row) => row.status === "in_progress" || row.status === "failed",
      ) ||
      (rows.some((row) => row.status === "done") &&
        rows.some((row) => row.status === "todo"));
    if (isActive) groups.push({ title: name.slice(0, -3), rows });
  }

  const status = frontmatter.status;
  return {
    slug,
    status: status !== undefined && STATUS_WORD_RE.test(status) ? status : null,
    readme: counts(readmeRows),
    tasks: taskRows.length > 0 ? counts(taskRows) : null,
    groups: capRows(groups),
    updatedAt: await $.clock.now(),
  };
}

function byPhaseNumber(a: string, b: string): number {
  const n = (name: string) => Number(PHASE_FILE_RE.exec(name)?.[1] ?? 0);
  return n(a) - n(b) || (a < b ? -1 : a > b ? 1 : 0);
}

function counts(rows: ModsPlanRow[]): ModsPlanCounts {
  const { todo, in_progress, done, failed } = summarize(rows);
  return { todo, in_progress, done, failed };
}

/** Keep at most MAX_ROWS rows in all; a group left empty by the cut goes. */
function capRows(groups: ModsPlanGroup[]): ModsPlanGroup[] {
  let room = MAX_ROWS;
  const out: ModsPlanGroup[] = [];
  for (const group of groups) {
    if (room <= 0) break;
    const rows = group.rows.slice(0, room);
    room -= rows.length;
    if (rows.length > 0) out.push({ title: group.title, rows });
  }
  return out;
}

function total(c: ModsPlanCounts): number {
  return c.todo + c.in_progress + c.done + c.failed;
}

function progress(c: ModsPlanCounts): string {
  const failed = c.failed > 0 ? `, ${c.failed} failed` : "";
  return `${c.done}/${total(c)} done${failed}`;
}

function countsLine(plan: ModsPlan): string {
  return plan.tasks
    ? `phases ${progress(plan.readme)}, tasks ${progress(plan.tasks)}`
    : progress(plan.readme);
}

/** The command's text: the slug, the status word and counts only. */
function summaryText(plan: ModsPlan): string {
  const status = plan.status ? ` (${plan.status})` : "";
  return `Plan ${plan.slug}${status}: ${countsLine(plan)}`;
}
