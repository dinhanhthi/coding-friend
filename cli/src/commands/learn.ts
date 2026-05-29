import { existsSync } from "fs";
import { resolve } from "path";

import { confirm } from "@inquirer/prompts";

import { resolveLearnDir } from "../lib/config.js";
import { commandExists, run, runWithStderr, streamExec } from "../lib/exec.js";
import { log, printBanner } from "../lib/log.js";
import { readJson } from "../lib/json.js";
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
    log.error(`Learn folder is not inside a git repository: ${learnDir}`);
    log.dim("Initialize a git repo there, or push it manually.");
    process.exit(1);
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
