import { execFileSync } from "child_process";
import { realpathSync, statSync } from "fs";
import { homedir } from "os";
import { basename, dirname, isAbsolute, join, relative } from "path";

import {
  type CloudFolder,
  type CloudRoot,
  cloudRootOf,
  detectCloudFolders,
  LEARN_SUBFOLDER,
} from "./cloud-folders.js";
import { resolveLearnDir } from "./config.js";
import { run } from "./exec.js";
import { type CodingFriendConfig } from "../types.js";

export type LearnMode = "git" | "folder";

export interface LearnStatus {
  outputDir: string;
  exists: boolean;
  mode: LearnMode;
  git: { root: string; isRoot: boolean; hasOrigin: boolean } | null;
  autoCommit: boolean;
  cloud: CloudRoot | null;
  suggestions: CloudFolder[];
}

export interface CommitResult {
  committed: boolean;
  commitError?: string;
}

const STATUS_TIMEOUT_MS = 5_000;
const COMMIT_TIMEOUT_MS = 20_000;

type GitResult = { ok: true; stdout: string } | { ok: false; error: string };

/**
 * Run git without a shell, with a timeout and no interactive prompts.
 * GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE (set when called from another repo's
 * hook) would override `-C`, so they are dropped.
 */
function git(args: string[], timeout: number): GitResult {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  try {
    const stdout = execFileSync("git", args, {
      encoding: "utf-8",
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (err) {
    const e = err as {
      code?: string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
    };
    if (e.code === "ETIMEDOUT")
      return { ok: false, error: `git timed out after ${timeout / 1000}s` };
    // "nothing to commit" goes to stdout, not stderr.
    const out = (e.stderr || e.stdout || "").toString().trim();
    return {
      ok: false,
      error: (out || e.message || "git failed").slice(0, 500),
    };
  }
}

let gitUsableCache: boolean | undefined;

/**
 * Whether running git is safe. On macOS /usr/bin/git is a shim that opens
 * the Command Line Tools install dialog when no developer dir is set, so
 * require `xcode-select -p` to succeed first (it never shows the dialog).
 */
function gitUsable(): boolean {
  if (gitUsableCache === undefined) {
    const path = run(process.platform === "win32" ? "where" : "which", ["git"]);
    gitUsableCache =
      path !== null &&
      (process.platform !== "darwin" ||
        path.split("\n")[0] !== "/usr/bin/git" ||
        run("xcode-select", ["-p"]) !== null);
  }
  return gitUsableCache;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function gitInfo(dir: string): LearnStatus["git"] {
  if (!gitUsable()) return null;
  const res = git(
    ["-C", dir, "rev-parse", "--is-inside-work-tree", "--show-toplevel"],
    STATUS_TIMEOUT_MS,
  );
  if (!res.ok) return null;
  const [inside, top] = res.stdout.split("\n");
  // Inside `.git/` rev-parse exits 0 but prints "false".
  if (inside !== "true" || !top) return null;
  const root = realpathSync(top);
  const remotes = git(["-C", root, "remote"], STATUS_TIMEOUT_MS);
  return {
    root,
    isRoot: root === realpathSync(dir),
    hasOrigin: remotes.ok && remotes.stdout.split("\n").includes("origin"),
  };
}

/** Storage mode of the learn folder: git when it is inside a git work tree, else folder. */
export function learnStatus(globalCfg: CodingFriendConfig | null): LearnStatus {
  const outputDir = resolveLearnDir(globalCfg);
  const exists = isDir(outputDir);
  const gitState = exists ? gitInfo(outputDir) : null;
  const home = homedir();
  return {
    outputDir,
    exists,
    mode: gitState ? "git" : "folder",
    git: gitState,
    autoCommit: globalCfg?.learn?.autoCommit ?? false,
    cloud: cloudRootOf(outputDir, home, process.platform),
    suggestions: detectCloudFolders(home, process.platform, LEARN_SUBFOLDER),
  };
}

/**
 * Commit one learn note after an edit or delete. Only in git mode with
 * autoCommit; stages and commits exactly `file` (never -A, never push or
 * init). Folder mode never spawns git.
 */
export function commitLearnChange(
  status: LearnStatus,
  file: string,
  action: "update" | "delete",
  id: string,
): CommitResult {
  if (status.mode !== "git" || !status.autoCommit || status.git === null) {
    return { committed: false };
  }
  const root = status.git.root;
  let rel: string;
  try {
    // The parent exists even after a delete; realpath it to match git's root.
    rel = relative(root, join(realpathSync(dirname(file)), basename(file)));
  } catch {
    return { committed: false, commitError: `cannot resolve ${file}` };
  }
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return { committed: false, commitError: `${file} is outside ${root}` };
  }

  const deadline = Date.now() + COMMIT_TIMEOUT_MS;
  // Literal pathspecs: a name with `*` or `:` must not match other files.
  const base = ["--literal-pathspecs", "-C", root];
  // `git add` stages a removal too (git >= 2.0).
  const add = git([...base, "add", "--", rel], COMMIT_TIMEOUT_MS);
  if (!add.ok) return { committed: false, commitError: add.error };
  const left = Math.max(1, deadline - Date.now());
  const commit = git(
    [...base, "commit", "-q", "-m", `learn: ${action} ${id}`, "--", rel],
    left,
  );
  if (!commit.ok) return { committed: false, commitError: commit.error };
  return { committed: true };
}
