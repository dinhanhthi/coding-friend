import { existsSync } from "fs";
import { resolve } from "path";

import { confirm } from "@inquirer/prompts";

import { resolveLearnDir } from "../lib/config.js";
import { commandExists, run, runWithStderr, streamExec } from "../lib/exec.js";
import {
  type LearnNotes,
  listNotes,
  resolveLearnNote,
  searchNotes,
} from "../lib/learn-notes.js";
import { commitLearnChange, learnStatus } from "../lib/learn-storage.js";
import { log, printBanner } from "../lib/log.js";
import { readJson } from "../lib/json.js";
import {
  deleteNote,
  readBodyFromStdin,
  readNote,
  replaceBody,
} from "../lib/note-io.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { globalConfigPath } from "../lib/paths.js";
import { type CodingFriendConfig } from "../types.js";

/**
 * Commit all changes in the learn folder and push to origin.
 *
 * Safety: only pushes when the learn folder is the ROOT of its git repo.
 * If learn lives inside a larger repo (e.g. docs/learn/ of another project),
 * pushing would commit unrelated changes — so we warn and ask for confirmation.
 */
export async function learnPushCommand(path?: string): Promise<void> {
  const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
  const learnDir = resolveLearnDir(globalCfg, path);

  printBanner("✨ Coding Friend Learn Push ✨");

  if (!existsSync(learnDir)) {
    log.error(`Learn folder not found: ${learnDir}`);
    log.dim("Run /cf-learn first to generate some docs.");
    process.exit(1);
  }

  if (!commandExists("git")) {
    log.error("git is not installed or not on PATH.");
    process.exit(1);
  }

  // Find the git repo root that contains the learn folder.
  const top = run("git", ["rev-parse", "--show-toplevel"], { cwd: learnDir });
  if (top === null) {
    log.info(
      "not applicable in folder mode (learn.outputDir is not a git repo)",
    );
    return;
  }

  const gitRoot = resolve(top);
  const resolvedLearnDir = resolve(learnDir);
  const isGitRoot = gitRoot === resolvedLearnDir;

  log.info(`Learn folder: ${resolvedLearnDir}`);
  log.info(`Git root:     ${gitRoot}`);
  console.log();

  if (!isGitRoot) {
    log.warn(
      "The learn folder is NOT the root of its git repository — it lives inside a larger repo.",
    );
    log.warn(
      "Pushing will commit and push EVERYTHING in that repo, not just the learn folder.",
    );
    const proceed = await confirm({
      message: "Continue anyway?",
      default: false,
    });
    if (!proceed) {
      log.dim("Aborted.");
      return;
    }
  }

  // Ensure an `origin` remote exists before staging/committing — fail fast so a
  // remote-less repo doesn't end up with an orphan commit it can't push.
  const remotes = run("git", ["remote"], { cwd: gitRoot });
  if (remotes === null || !remotes.split("\n").includes("origin")) {
    log.error("No `origin` remote configured in this repository.");
    log.dim("Add one with: git remote add origin <url>");
    process.exit(1);
  }

  // Nothing to commit?
  const status = run("git", ["status", "--porcelain"], { cwd: gitRoot });
  if (status === null) {
    log.error("Failed to read git status.");
    process.exit(1);
  }
  if (status === "") {
    log.info("Nothing to commit — working tree is clean.");
  } else {
    log.step("Staging and committing changes...");
    const stage = runWithStderr("git", ["add", "-A"], { cwd: gitRoot });
    if (stage.exitCode !== 0) {
      log.error(`git add failed: ${stage.stderr}`);
      process.exit(1);
    }
    const commit = runWithStderr(
      "git",
      ["commit", "-m", "docs(learn): update learning notes"],
      { cwd: gitRoot },
    );
    if (commit.exitCode !== 0) {
      log.error(`git commit failed: ${commit.stderr || commit.stdout}`);
      process.exit(1);
    }
    log.success("Committed.");
  }

  console.log();

  // Push the current branch to origin explicitly. Plain `git push` fails when no
  // upstream is set and may push to a different remote when the branch tracks one,
  // so target `origin HEAD` to reliably push the learn notes to the intended remote.
  log.step("Pushing to origin...");
  const pushCode = await streamExec("git", ["push", "origin", "HEAD"], {
    cwd: gitRoot,
  });
  if (pushCode !== 0) {
    log.error("git push failed.");
    process.exit(1);
  }
  log.success("Pushed.");
}

// ─── status / list / search / show / edit / delete ────────────────────────────

interface JsonFlag {
  json?: boolean;
}

function globalCfg(): CodingFriendConfig | null {
  return readJson<CodingFriendConfig>(globalConfigPath());
}

/** Human mode: log a CliError's message, then exit 1 (via runHuman). */
async function runHumanLogged(fn: () => void | Promise<void>): Promise<void> {
  await runHuman(async () => {
    try {
      await fn();
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

export async function learnStatusCommand(opts: JsonFlag = {}): Promise<void> {
  if (opts.json) {
    await runJson(() => learnStatus(globalCfg()));
    return;
  }
  await runHumanLogged(() => {
    const s = learnStatus(globalCfg());
    log.info(`Learn folder: ${s.outputDir}${s.exists ? "" : " (missing)"}`);
    log.info(
      s.git
        ? `Mode: git (root ${s.git.root}${s.git.hasOrigin ? ", origin set" : ", no origin"})`
        : "Mode: folder (files only, no git)",
    );
    log.info(`Auto-commit: ${s.autoCommit ? "on" : "off"}`);
    if (s.cloud)
      log.info(`Cloud folder: ${s.cloud.provider} (${s.cloud.root})`);
    for (const f of s.suggestions) {
      log.dim(`Suggested: ${f.label} → ${f.path}${f.exists ? "" : " (new)"}`);
    }
  });
}

function printNotes({ notes, placeholders }: LearnNotes): void {
  for (const n of notes) {
    const conflict = n.possibleConflictOf
      ? ` (possible conflict copy of ${n.possibleConflictOf})`
      : "";
    console.log(`${n.id}  ${n.title}${conflict}`);
  }
  if (notes.length === 0) log.dim("No notes.");
  if (placeholders.length > 0) {
    log.dim(`Not downloaded (${placeholders.length}):`);
    for (const p of placeholders) log.dim(`  ${p.id}`);
  }
}

function notesView(fn: (outputDir: string) => LearnNotes) {
  const s = learnStatus(globalCfg());
  return { outputDir: s.outputDir, mode: s.mode, ...fn(s.outputDir) };
}

export async function learnListCommand(opts: JsonFlag = {}): Promise<void> {
  if (opts.json) {
    await runJson(() => notesView(listNotes));
    return;
  }
  await runHumanLogged(() => printNotes(notesView(listNotes)));
}

export async function learnSearchCommand(
  query: string,
  opts: JsonFlag = {},
): Promise<void> {
  const search = () => ({
    query,
    ...notesView((dir) => searchNotes(dir, query)),
  });
  if (opts.json) {
    await runJson(search);
    return;
  }
  await runHumanLogged(() => printNotes(search()));
}

export async function learnShowCommand(
  id: string,
  opts: JsonFlag = {},
): Promise<void> {
  const show = () => {
    const path = resolveLearnNote(resolveLearnDir(globalCfg()), id);
    const note = readNote(path);
    return {
      raw: note.frontmatterRaw + note.content,
      data: {
        id,
        path,
        frontmatter: note.frontmatter,
        content: note.content,
        sha256: note.sha256,
        mtime: note.mtime,
      },
    };
  };
  if (opts.json) {
    await runJson(() => show().data);
    return;
  }
  await runHumanLogged(() => {
    process.stdout.write(show().raw);
  });
}

function printCommit(res: { committed: boolean; commitError?: string }): void {
  if (res.committed) log.info("Committed to the learn repo.");
  if (res.commitError) log.warn(`Not committed: ${res.commitError}`);
}

export async function learnEditCommand(
  id: string,
  opts: JsonFlag & { stdin?: boolean; ifMatch?: string } = {},
): Promise<void> {
  const edit = async () => {
    if (!opts.stdin) {
      throw new CliError(
        "INVALID_ARGS",
        "--stdin is required: pipe the new body on stdin",
      );
    }
    if (!opts.ifMatch) {
      throw new CliError(
        "INVALID_ARGS",
        "--if-match <sha256> is required (from `cf learn show`)",
      );
    }
    const status = learnStatus(globalCfg());
    const path = resolveLearnNote(status.outputDir, id);
    const body = await readBodyFromStdin();
    // A broken pipe sends nothing: never let it wipe a note.
    if (body.trim() === "") throw new CliError("INVALID_VALUE", "empty body");
    const { sha256 } = replaceBody(path, body, opts.ifMatch);
    const commit =
      sha256 === opts.ifMatch.trim().toLowerCase()
        ? { committed: false }
        : commitLearnChange(status, path, "update", id);
    return { id, path, sha256, mode: status.mode, ...commit };
  };
  if (opts.json) {
    await runJson(edit);
    return;
  }
  await runHumanLogged(async () => {
    const data = await edit();
    log.success(`Updated ${data.id} (${data.path})`);
    printCommit(data);
  });
}

export async function learnDeleteCommand(
  id: string,
  opts: JsonFlag & { yes?: boolean; ifMatch?: string } = {},
): Promise<void> {
  const del = async () => {
    const status = learnStatus(globalCfg());
    const path = resolveLearnNote(status.outputDir, id);
    if (!opts.yes) {
      if (opts.json) {
        throw new CliError(
          "INTERACTIVE_REQUIRED",
          "Deleting a learn note in JSON mode needs --yes",
        );
      }
      const ok = await confirm({
        message: `Delete learn note ${id}?`,
        default: false,
      });
      if (!ok) return null;
    }
    deleteNote(path, opts.ifMatch);
    const commit = commitLearnChange(status, path, "delete", id);
    return { id, path, deleted: true as const, mode: status.mode, ...commit };
  };
  if (opts.json) {
    await runJson(del);
    return;
  }
  await runHumanLogged(async () => {
    const data = await del();
    if (!data) {
      log.info("Cancelled.");
      return;
    }
    log.success(`Deleted ${data.id} (${data.path})`);
    printCommit(data);
  });
}
