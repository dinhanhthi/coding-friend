import { spawnSync } from "child_process";
import { createHash, randomBytes } from "crypto";
import {
  closeSync,
  constants,
  type Dirent,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readlinkSync,
  readSync,
  realpathSync,
  type Stats,
  unlinkSync,
} from "fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "path";
import { CliError } from "../output.js";
import { makeChefPrivateDir } from "./chef-store.js";
import { assertRealDir, mkdirReal } from "./store.js";

/**
 * The only module that runs git for a chef. Hard rule: CF never runs a git
 * command that reads working-tree contents (status, diff, add, commit,
 * stash, checkout, restore, reset, anything with -p/textconv/filters): a
 * writer worker may have planted a clean filter, textconv, fsmonitor or hook
 * in a checkout it can write, and those run outside every sandbox. CF hashes
 * working-tree bytes itself and builds commits with plumbing from those
 * bytes.
 *
 * Every git call goes through `gitRun`: absolute git binary, no shell, cwd a
 * neutral CF dir, env from an allowlist, `--git-dir=<pinned realpath>
 * --work-tree=<checkout> -c core.hooksPath=<empty CF dir> -c
 * core.fsmonitor=false` (plus the other fixed `-c` keys in HARDENING), and
 * an allowlist of subcommands and their flags checked before anything is
 * spawned.
 *
 * The object store is worker-writable and git does not verify everything it
 * reads (a pre-planted loose blob, packs, alternates). CF therefore reads
 * every object it relies on (the base commit and all its trees, every
 * object it writes) through `cat-file --batch` and recomputes the object
 * hash in Node; a mismatch refuses the commit.
 */

// ─── errors ─────────────────────────────────────────────────────────────

export type ChefGitErrorKind =
  /** gitRun refused the command line (nothing was spawned). */
  | "GIT_DENIED"
  /** git could not run, timed out, overflowed or exited non-zero. */
  | "GIT_FAILED"
  /** computeFingerprint went over its file or byte cap. */
  | "FINGERPRINT_OVER_CAP"
  /** snapshotSteering went over its file, byte or walk cap. */
  | "STEERING_OVER_CAP"
  /** An object read back from the store does not hash to its name (tampered). */
  | "OBJECT_MISMATCH"
  /** Bad input (sha, branch, path, context). */
  | "INVALID";

/** CliError (code COMMAND_FAILED) with a chef-git specific `kind`. */
export class ChefGitError extends CliError {
  constructor(
    public readonly kind: ChefGitErrorKind,
    message: string,
  ) {
    super("COMMAND_FAILED", message);
    this.name = "ChefGitError";
  }
}

// ─── gitRun ─────────────────────────────────────────────────────────────

/** Everything pinned for one checkout (from chef.json + CF dirs). */
export interface GitCtx {
  /** Absolute git binary resolved at `cf chef start`. */
  gitBin: string;
  /** realpath of the git dir pinned at start. */
  gitDir: string;
  /** realpath of the checkout (work tree). */
  checkout: string;
  /** Empty CF-owned dir passed as core.hooksPath (see makeChefHooksDir). */
  hooksDir: string;
  /** CF dir used as cwd (never the checkout), e.g. chefs/<id>/private. */
  neutralCwd: string;
}

export interface GitRunOptions extends GitCtx {
  /** Subcommand first, then its args (checked against the allowlist). */
  args: string[];
  input?: Buffer | string;
  /** Temp index (GIT_INDEX_FILE); required by read-tree and write-tree. */
  indexFile?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface GitRunResult {
  status: number;
  stdout: Buffer;
  stderr: string;
}

const GIT_TIMEOUT_MS = 60_000;
const GIT_MAX_OUTPUT = 64 * 1024 * 1024;
const STDERR_CAP = 500;
const ENV_KEEP = new Set(["HOME", "PATH", "LANG", "USER", "TMPDIR"]);
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ATTR_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const FILE_MODES = new Set(["100644", "100755", "120000"]);
/**
 * Fixed `-c` keys on every git call: no hooks, no fsmonitor, no
 * commit-graph or multi-pack-index (both read without content
 * verification), no auto gc, and no index extensions a writer could have
 * turned on (untracked cache, split index, sparse checkout).
 */
const HARDENING = [
  "core.fsmonitor=false",
  "core.commitGraph=false",
  "core.multiPackIndex=false",
  "gc.auto=0",
  "core.untrackedCache=false",
  "core.splitIndex=false",
  "core.sparseCheckout=false",
];
const READ_ONLY = new Set([
  "rev-parse",
  "symbolic-ref",
  "ls-files",
  "ls-tree",
  "cat-file",
  "check-attr",
  "config",
  "diff-index",
]);

function deny(args: string[], why: string): never {
  throw new ChefGitError(
    "GIT_DENIED",
    `git ${clip(String(args[0]))} refused: ${why}`,
  );
}

function clip(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, STDERR_CAP);
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && SHA_RE.test(value);
}

/** git check-ref-format rules for a branch name (refs/heads/<name>). */
export function isBranchName(name: unknown): name is string {
  if (typeof name !== "string" || !name || name.length > 200) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(name)) return false;
  if (/\.\.|@\{|\/\//.test(name) || name === "@") return false;
  if (name.startsWith("-") || name.startsWith("/")) return false;
  if (name.endsWith("/") || name.endsWith(".")) return false;
  return name
    .split("/")
    .every((c) => c !== "" && !c.startsWith(".") && !c.endsWith(".lock"));
}

function isBranchRef(ref: string): boolean {
  return ref.startsWith("refs/heads/") && isBranchName(ref.slice(11));
}

/** Every element of `flags` is in `allowed`. */
function onlyFlags(flags: string[], allowed: string[]): boolean {
  return flags.every((f) => allowed.includes(f));
}

/**
 * Throws GIT_DENIED unless `args` is one of the exact shapes CF uses.
 * Returns true when the command is read-only (GIT_OPTIONAL_LOCKS=0).
 */
function checkAllowed(args: string[], indexFile?: string): boolean {
  if (!Array.isArray(args) || args.length === 0) deny(["?"], "no subcommand");
  if (!args.every((a) => typeof a === "string" && !a.includes("\0"))) {
    deny(args, "bad argument");
  }
  const [sub, ...rest] = args;
  const flags = rest.filter((a) => a.startsWith("-"));
  const positional = rest.filter((a) => !a.startsWith("-"));
  switch (sub) {
    case "rev-parse": {
      const ok =
        (rest.length === 1 &&
          (rest[0] === "--show-object-format" || rest[0] === "--git-dir")) ||
        (rest.length === 2 && rest[0] === "--verify" && isBranchRef(rest[1]));
      if (!ok)
        deny(
          args,
          "only --show-object-format, --git-dir or --verify refs/heads/<branch>",
        );
      break;
    }
    case "symbolic-ref":
      if (rest.length !== 2 || rest[0] !== "-q" || rest[1] !== "HEAD") {
        deny(args, "only -q HEAD");
      }
      break;
    case "ls-files":
      if (
        positional.length ||
        !onlyFlags(flags, ["-s", "-o", "--exclude-standard", "-z"])
      ) {
        deny(args, "only -s, -o, --exclude-standard, -z");
      }
      break;
    case "ls-tree":
      if (
        positional.length !== 1 ||
        !isSha(positional[0]) ||
        !onlyFlags(flags, ["-r", "-z"])
      ) {
        deny(args, "only -r, -z and one resolved sha");
      }
      break;
    case "cat-file": {
      const ok =
        (rest.length === 2 &&
          ["-t", "-s", "-e"].includes(rest[0]) &&
          isSha(rest[1])) ||
        (rest.length === 1 &&
          (rest[0] === "--batch-check" || rest[0] === "--batch"));
      if (!ok) deny(args, "only -t|-s|-e <sha>, --batch-check or --batch");
      break;
    }
    case "check-attr":
      if (
        !flags.includes("--stdin") ||
        !onlyFlags(flags, ["--stdin", "-z"]) ||
        positional.length === 0 ||
        !positional.every((a) => ATTR_RE.test(a))
      ) {
        deny(args, "only --stdin, -z and attribute names");
      }
      break;
    case "config":
      if (
        positional.length ||
        !flags.includes("--list") ||
        !onlyFlags(flags, ["--list", "--show-origin", "--show-scope", "-z"])
      ) {
        deny(args, "only --list --show-origin --show-scope -z");
      }
      break;
    case "hash-object":
      if (
        positional.length ||
        !flags.includes("--stdin") ||
        !flags.includes("--no-filters") ||
        !onlyFlags(flags, ["-w", "--stdin", "--no-filters"])
      ) {
        deny(args, "only -w --stdin --no-filters");
      }
      break;
    case "read-tree":
      if (rest.length !== 1 || !isSha(rest[0])) deny(args, "only <sha>");
      if (!indexFile) deny(args, "needs a temp index");
      break;
    case "update-index":
      checkUpdateIndex(args, rest);
      break;
    case "write-tree":
      if (rest.length) deny(args, "takes no arguments");
      if (!indexFile) deny(args, "needs a temp index");
      break;
    case "commit-tree": {
      const ok =
        rest.length === 6 &&
        isSha(rest[0]) &&
        rest[1] === "-p" &&
        isSha(rest[2]) &&
        rest[3] === "--no-gpg-sign" &&
        rest[4] === "-F" &&
        rest[5] === "-";
      if (!ok) deny(args, "only <tree> -p <sha> --no-gpg-sign -F -");
      break;
    }
    case "update-ref": {
      const ok =
        rest.length === 6 &&
        rest[0] === "--no-deref" &&
        rest[1] === "-m" &&
        /^[ -~]{1,200}$/.test(rest[2]) &&
        isBranchRef(rest[3]) &&
        isSha(rest[4]) &&
        isSha(rest[5]);
      if (!ok) {
        deny(args, "only --no-deref -m <msg> refs/heads/<branch> <new> <old>");
      }
      break;
    }
    case "diff-index": {
      const required = ["--cached", "-z", "--no-ext-diff", "--no-textconv"];
      const formats = flags.filter((f) => f === "--name-only" || f === "--raw");
      const ok =
        positional.length === 1 &&
        isSha(positional[0]) &&
        rest[rest.length - 1] === positional[0] &&
        required.every((f) => flags.includes(f)) &&
        formats.length === 1 &&
        onlyFlags(flags, [...required, "--name-only", "--raw", "--no-renames"]);
      if (!ok) {
        deny(
          args,
          "only --cached --name-only|--raw -z --no-ext-diff --no-textconv <sha>",
        );
      }
      break;
    }
    default:
      deny(args, "subcommand not allowed");
  }
  return READ_ONLY.has(sub);
}

/** update-index: `--add (--cacheinfo <mode>,<sha>,<path>)+` or `--force-remove -- <path>+`. */
function checkUpdateIndex(args: string[], rest: string[]): void {
  if (rest[0] === "--add") {
    const pairs = rest.slice(1);
    if (pairs.length === 0 || pairs.length % 2 !== 0) {
      deny(args, "--add needs --cacheinfo entries");
    }
    for (let i = 0; i < pairs.length; i += 2) {
      const m = /^(\d{6}),([0-9a-f]+),(.*)$/s.exec(pairs[i + 1]);
      if (
        pairs[i] !== "--cacheinfo" ||
        !m ||
        !FILE_MODES.has(m[1]) ||
        !isSha(m[2]) ||
        relPathProblem(m[3]) !== null
      ) {
        deny(args, "bad --cacheinfo entry");
      }
    }
    return;
  }
  if (rest[0] === "--force-remove" && rest[1] === "--" && rest.length > 2) {
    if (!rest.slice(2).every((p) => relPathProblem(p) === null)) {
      deny(args, "bad path");
    }
    return;
  }
  deny(args, "only --add --cacheinfo ... or --force-remove -- <paths>");
}

/** Env for git: allowlisted variables, every inherited GIT_* dropped. */
export function gitEnv(
  readOnly: boolean,
  indexFile?: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && (ENV_KEEP.has(k) || k.startsWith("LC_"))) env[k] = v;
  }
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_NO_LAZY_FETCH = "1";
  env.GIT_NO_REPLACE_OBJECTS = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  if (readOnly) env.GIT_OPTIONAL_LOCKS = "0";
  if (indexFile) env.GIT_INDEX_FILE = indexFile;
  return env;
}

function isEmptyRealDir(dir: string): boolean {
  try {
    assertRealDir(dir);
    return readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}

/**
 * Run one allowlisted git command, hardened. Refusals throw GIT_DENIED
 * before spawning; spawn errors, timeouts and output overflow throw
 * GIT_FAILED. A non-zero exit is returned (callers decide).
 */
export function gitRun(opts: GitRunOptions): GitRunResult {
  const readOnly = checkAllowed(opts.args, opts.indexFile);
  for (const [name, p] of [
    ["gitBin", opts.gitBin],
    ["gitDir", opts.gitDir],
    ["checkout", opts.checkout],
    ["hooksDir", opts.hooksDir],
    ["neutralCwd", opts.neutralCwd],
    ["indexFile", opts.indexFile ?? "/"],
  ] as const) {
    if (typeof p !== "string" || !isAbsolute(p)) {
      deny(opts.args, `${name} must be an absolute path`);
    }
  }
  if (!isEmptyRealDir(opts.hooksDir)) {
    deny(opts.args, "hooksDir must be an empty real directory");
  }
  if (
    opts.args[0] === "cat-file" &&
    opts.args[1] === "--batch" &&
    !/^(?:[0-9a-f]{40}\n|[0-9a-f]{64}\n)*$/.test(String(opts.input ?? ""))
  ) {
    deny(opts.args, "--batch input must be one sha per line");
  }
  const argv = [
    `--git-dir=${opts.gitDir}`,
    `--work-tree=${opts.checkout}`,
    "-c",
    `core.hooksPath=${opts.hooksDir}`,
    ...HARDENING.flatMap((kv) => ["-c", kv]),
    ...opts.args,
  ];
  const res = spawnSync(opts.gitBin, argv, {
    cwd: opts.neutralCwd,
    env: gitEnv(readOnly, opts.indexFile),
    input: opts.input ?? "",
    timeout: opts.timeoutMs ?? GIT_TIMEOUT_MS,
    killSignal: "SIGKILL",
    maxBuffer: opts.maxOutputBytes ?? GIT_MAX_OUTPUT,
    shell: false,
    windowsHide: true,
  });
  if (res.error || res.status === null) {
    const why = res.error
      ? (res.error as NodeJS.ErrnoException).code || res.error.message
      : `signal ${String(res.signal)}`;
    throw new ChefGitError(
      "GIT_FAILED",
      `git ${opts.args[0]} did not complete: ${clip(String(why))}`,
    );
  }
  return {
    status: res.status,
    stdout: res.stdout,
    stderr: clip(res.stderr.toString("utf-8")),
  };
}

type RunExtra = Pick<GitRunOptions, "input" | "indexFile" | "maxOutputBytes">;

/** gitRun that throws GIT_FAILED on a non-zero exit. */
function git(ctx: GitCtx, args: string[], extra: RunExtra = {}): Buffer {
  const r = gitRun({ ...ctxOnly(ctx), ...extra, args });
  if (r.status !== 0) {
    throw new ChefGitError(
      "GIT_FAILED",
      `git ${args[0]} failed (exit ${r.status}): ${r.stderr}`,
    );
  }
  return r.stdout;
}

function ctxOnly(ctx: GitCtx): GitCtx {
  const { gitBin, gitDir, checkout, hooksDir, neutralCwd } = ctx;
  return { gitBin, gitDir, checkout, hooksDir, neutralCwd };
}

/**
 * chefs/<id>/private/hooks: the empty dir passed as core.hooksPath (0700,
 * real dir at every level). Throws when something was put in it.
 */
export function makeChefHooksDir(id: string): string {
  const dir = join(makeChefPrivateDir(id), "hooks");
  mkdirReal(dir);
  if (readdirSync(dir).length !== 0) {
    throw new ChefGitError("INVALID", `CF hooks dir is not empty: ${dir}`);
  }
  return dir;
}

// ─── small git readers ──────────────────────────────────────────────────

export type ObjectFormat = "sha1" | "sha256";

export function gitObjectFormat(ctx: GitCtx): ObjectFormat {
  const out = git(ctx, ["rev-parse", "--show-object-format"])
    .toString("utf-8")
    .trim();
  if (out !== "sha1" && out !== "sha256") {
    throw new ChefGitError("GIT_FAILED", `unknown object format ${clip(out)}`);
  }
  return out;
}

/** Target of HEAD (`refs/heads/<branch>`), or null when detached. */
export function readSymbolicHead(ctx: GitCtx): string | null {
  const r = gitRun({ ...ctxOnly(ctx), args: ["symbolic-ref", "-q", "HEAD"] });
  if (r.status !== 0) return null;
  return r.stdout.toString("utf-8").trim();
}

/** sha of refs/heads/<branch> (never the name HEAD). */
export function resolveBranchHead(ctx: GitCtx, branch: string): string {
  if (!isBranchName(branch)) {
    throw new ChefGitError("INVALID", `invalid branch name`);
  }
  const out = git(ctx, ["rev-parse", "--verify", `refs/heads/${branch}`])
    .toString("utf-8")
    .trim();
  if (!isSha(out))
    throw new ChefGitError("GIT_FAILED", "rev-parse gave no sha");
  return out;
}

/** NUL-separated records (trailing NUL dropped). */
function splitZ(buf: Buffer): string[] {
  const parts = buf.toString("utf-8").split("\0");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

interface TreeEntry {
  mode: string;
  sha: string;
}

// ─── verified object reads ──────────────────────────────────────────────

function tampered(what: string): never {
  throw new ChefGitError("OBJECT_MISMATCH", `object store tampered: ${what}`);
}

/** Object id of `<type> <size>\0<content>` for the object format. */
function objectHash(type: string, bytes: Buffer, format: ObjectFormat): string {
  const h = createHash(format === "sha256" ? "sha256" : "sha1");
  h.update(`${type} ${bytes.length}\0`);
  h.update(bytes);
  return h.digest("hex");
}

interface GitObject {
  type: string;
  bytes: Buffer;
}

const BATCH_CHUNK = 2_000;

/**
 * Read objects with `cat-file --batch` (shas on stdin) and recompute each
 * object's hash in Node: a missing object, a framing error, a type other
 * than `type` or bytes that do not hash to the requested sha throw
 * OBJECT_MISMATCH. git does not verify every read (packs, alternates, a
 * pre-planted loose blob), so this is the only check CF trusts.
 */
function readObjectsVerified(
  ctx: GitCtx,
  format: ObjectFormat,
  shas: string[],
  type: string,
  maxOutputBytes?: number,
): Map<string, GitObject> {
  const hexLen = format === "sha256" ? 64 : 40;
  const out = new Map<string, GitObject>();
  const want = [...new Set(shas)];
  for (const s of want) {
    if (!isSha(s) || s.length !== hexLen) tampered(`bad object id ${clip(s)}`);
  }
  for (let k = 0; k < want.length; k += BATCH_CHUNK) {
    const chunk = want.slice(k, k + BATCH_CHUNK);
    const buf = git(ctx, ["cat-file", "--batch"], {
      input: chunk.map((s) => `${s}\n`).join(""),
      maxOutputBytes,
    });
    let pos = 0;
    for (const sha of chunk) {
      const nl = buf.indexOf(0x0a, pos);
      if (nl === -1) tampered(`truncated batch output for ${sha}`);
      const header = buf.subarray(pos, nl).toString("latin1");
      const m = /^([0-9a-f]+) ([a-z]+) (\d+)$/.exec(header);
      if (!m || m[1] !== sha) tampered(`${sha} missing or unreadable`);
      const size = Number(m[3]);
      const start = nl + 1;
      const end = start + size;
      if (!Number.isSafeInteger(size) || end + 1 > buf.length) {
        tampered(`truncated object ${sha}`);
      }
      if (buf[end] !== 0x0a) tampered(`bad batch framing after ${sha}`);
      const bytes = buf.subarray(start, end);
      if (m[2] !== type) tampered(`${sha} is a ${m[2]}, expected ${type}`);
      if (objectHash(m[2], bytes, format) !== sha) {
        tampered(`${sha} does not hash to its name`);
      }
      out.set(sha, { type: m[2], bytes: Buffer.from(bytes) });
      pos = end + 1;
    }
    if (pos !== buf.length) tampered("trailing batch output");
  }
  return out;
}

/** One verified object of `type`. */
function readObjectVerified(
  ctx: GitCtx,
  format: ObjectFormat,
  sha: string,
  type: string,
  maxOutputBytes?: number,
): Buffer {
  return readObjectsVerified(ctx, format, [sha], type, maxOutputBytes).get(sha)!
    .bytes;
}

interface RawTreeEntry {
  /** Canonical mode: 40000 (tree), 100644, 100755, 120000, 160000. */
  mode: string;
  name: string;
  sha: string;
}

/** Canonical mode as `ls-tree` prints it (git's canon_mode). */
function canonMode(octal: string): string | null {
  if (!/^[0-7]{5,6}$/.test(octal)) return null;
  const mode = parseInt(octal, 8);
  switch (mode & 0o170000) {
    case 0o040000:
      return "40000";
    case 0o120000:
      return "120000";
    case 0o160000:
      return "160000";
    case 0o100000:
      return mode & 0o100 ? "100755" : "100644";
    default:
      return null;
  }
}

/** Parse a verified tree object: `<mode> SP <name> NUL <raw id>`*. */
function parseTree(
  sha: string,
  bytes: Buffer,
  format: ObjectFormat,
): RawTreeEntry[] {
  const idLen = format === "sha256" ? 32 : 20;
  const entries: RawTreeEntry[] = [];
  let pos = 0;
  while (pos < bytes.length) {
    const sp = bytes.indexOf(0x20, pos);
    const nul = sp === -1 ? -1 : bytes.indexOf(0x00, sp + 1);
    if (sp === -1 || nul === -1 || nul + 1 + idLen > bytes.length) {
      tampered(`malformed tree ${sha}`);
    }
    const mode = canonMode(bytes.subarray(pos, sp).toString("latin1"));
    const name = bytes.subarray(sp + 1, nul).toString("utf-8");
    if (!mode || !name || name === "." || name === ".." || name.includes("/")) {
      tampered(`malformed tree entry in ${sha}`);
    }
    entries.push({
      mode,
      name,
      sha: bytes.subarray(nul + 1, nul + 1 + idLen).toString("hex"),
    });
    pos = nul + 1 + idLen;
  }
  return entries;
}

/** Limits of a verified tree walk. */
export interface TreeWalkCaps {
  /** Tree objects visited. */
  maxTrees: number;
  /** Non-tree entries (blobs, symlinks, gitlinks). */
  maxEntries: number;
}

/** Parsed verified trees by sha (content is bound to the sha, so reusable). */
type TreeCache = Map<string, RawTreeEntry[]>;

/**
 * Every non-tree entry (path → mode, sha) under `tree`, like `ls-tree -r`,
 * reading each tree object verified (one `cat-file --batch` per level).
 * Over a cap → ChefGitError FINGERPRINT_OVER_CAP.
 */
function walkTreeVerified(
  ctx: GitCtx,
  format: ObjectFormat,
  tree: string,
  caps: TreeWalkCaps,
  cache: TreeCache = new Map(),
): Map<string, TreeEntry> {
  const files = new Map<string, TreeEntry>();
  let level: Array<{ prefix: string; sha: string }> = [
    { prefix: "", sha: tree },
  ];
  let trees = 0;
  while (level.length) {
    trees += level.length;
    if (trees > caps.maxTrees) {
      throw new ChefGitError(
        "FINGERPRINT_OVER_CAP",
        `base tree has more than ${caps.maxTrees} trees`,
      );
    }
    const fresh = level.map((l) => l.sha).filter((s) => !cache.has(s));
    for (const [sha, obj] of readObjectsVerified(ctx, format, fresh, "tree")) {
      cache.set(sha, parseTree(sha, obj.bytes, format));
    }
    const next: typeof level = [];
    for (const { prefix, sha } of level) {
      for (const e of cache.get(sha)!) {
        const path = `${prefix}${e.name}`;
        if (e.mode === "40000") {
          next.push({ prefix: `${path}/`, sha: e.sha });
          continue;
        }
        files.set(path, { mode: e.mode, sha: e.sha });
        if (files.size > caps.maxEntries) {
          throw new ChefGitError(
            "FINGERPRINT_OVER_CAP",
            `base tree has more than ${caps.maxEntries} files`,
          );
        }
      }
    }
    level = next;
  }
  return files;
}

interface VerifiedBase {
  /** Root tree sha read from the verified commit object. */
  tree: string;
  files: Map<string, TreeEntry>;
  cache: TreeCache;
}

/**
 * The verified base of `commit`: the commit object read and hash-checked,
 * its `tree <sha>` line parsed in Node, and every tree under it verified.
 */
function verifiedBase(
  ctx: GitCtx,
  format: ObjectFormat,
  commit: string,
  caps: TreeWalkCaps,
): VerifiedBase {
  const body = readObjectVerified(ctx, format, commit, "commit");
  const first = body.subarray(0, body.indexOf(0x0a)).toString("latin1");
  const m = /^tree ([0-9a-f]+)$/.exec(first);
  if (!m || m[1].length !== (format === "sha256" ? 64 : 40)) {
    tampered(`commit ${commit} has no tree line`);
  }
  const cache: TreeCache = new Map();
  const files = walkTreeVerified(ctx, format, m[1], caps, cache);
  return { tree: m[1], files, cache };
}

interface IndexEntry extends TreeEntry {
  conflict: boolean;
}

/** `ls-files -s -z`: `<mode> SP <sha> SP <stage> TAB <path>`. */
function readIndex(ctx: GitCtx): Map<string, IndexEntry> {
  const map = new Map<string, IndexEntry>();
  for (const rec of splitZ(git(ctx, ["ls-files", "-s", "-z"]))) {
    const m = /^(\d{6}) ([0-9a-f]+) (\d)\t(.*)$/s.exec(rec);
    if (!m) continue;
    const prev = map.get(m[4]);
    if (m[3] === "0" && !prev) {
      map.set(m[4], { mode: m[1], sha: m[2], conflict: false });
    } else {
      map.set(m[4], { mode: m[1], sha: m[2], conflict: true });
    }
  }
  return map;
}

interface ConfigEntry {
  scope: string;
  key: string;
  value: string | null;
}

/** `config --list --show-origin --show-scope -z`: bytes + parsed entries. */
function readConfig(ctx: GitCtx): { bytes: Buffer; entries: ConfigEntry[] } {
  const bytes = git(ctx, [
    "config",
    "--list",
    "--show-origin",
    "--show-scope",
    "-z",
  ]);
  const parts = splitZ(bytes);
  const entries: ConfigEntry[] = [];
  // Records are scope NUL origin NUL key[LF value] NUL.
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const kv = parts[i + 2];
    const nl = kv.indexOf("\n");
    entries.push({
      scope: parts[i],
      key: (nl === -1 ? kv : kv.slice(0, nl)).toLowerCase(),
      value: nl === -1 ? null : kv.slice(nl + 1),
    });
  }
  return { bytes, entries };
}

/** Effective (last) value of `key`; `undefined` when unset. */
function configValue(
  entries: ConfigEntry[],
  key: string,
  opts: { ignoreCommandLine?: boolean } = {},
): string | null | undefined {
  let found: string | null | undefined;
  for (const e of entries) {
    if (e.key !== key) continue;
    if (opts.ignoreCommandLine && e.scope === "command") continue;
    found = e.value;
  }
  return found;
}

/** git's boolean: no value = true; yes/on/true/1 = true. */
function configBool(value: string | null | undefined, dflt: boolean): boolean {
  if (value === undefined) return dflt;
  if (value === null) return true;
  const v = value.trim().toLowerCase();
  if (["true", "yes", "on"].includes(v)) return true;
  if (["false", "no", "off", ""].includes(v)) return false;
  const n = Number(v);
  return Number.isFinite(n) ? n !== 0 : dflt;
}

/** The repo's own core.hooksPath (not CF's -c override), absolute, or null. */
function repoHooksPath(ctx: GitCtx, entries: ConfigEntry[]): string | null {
  const v = configValue(entries, "core.hookspath", { ignoreCommandLine: true });
  if (!v) return null;
  if (v === "~" || v.startsWith("~/")) {
    return join(process.env.HOME || "/", v.slice(1));
  }
  return resolve(ctx.checkout, v);
}

/** Common git dir (linked worktrees keep hooks/info there). */
function commonDir(gitDir: string): string {
  const bytes = readNoFollow(join(gitDir, "commondir"), 4096);
  if (bytes.kind !== "file") return gitDir;
  const rel = bytes.bytes.toString("utf-8").trim();
  return rel ? resolve(gitDir, rel) : gitDir;
}

// ─── reading the working tree ───────────────────────────────────────────

type NoFollowRead =
  | { kind: "missing" }
  | { kind: "dir" }
  | { kind: "special" }
  | { kind: "too-big" }
  | { kind: "file"; exec: boolean; bytes: Buffer; dev: number; ino: number }
  | { kind: "symlink"; bytes: Buffer; dev: number; ino: number };

/** Read `fd` to EOF; null when it holds more than `max` bytes. */
function readFdCapped(fd: number, max: number): Buffer | null {
  const chunks: Buffer[] = [];
  let total = 0;
  const buf = Buffer.allocUnsafe(1024 * 1024);
  for (;;) {
    const n = readSync(fd, buf, 0, buf.length, null);
    if (n === 0) break;
    total += n;
    if (total > max) return null;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks, total);
}

/**
 * lstat `abs` and read it once without following a final symlink: regular
 * file bytes (O_NOFOLLOW, O_NONBLOCK so a planted FIFO never blocks, fstat
 * checked), or a symlink's target bytes.
 */
function readNoFollow(abs: string, max: number): NoFollowRead {
  let st: Stats;
  try {
    st = lstatSync(abs);
  } catch {
    return { kind: "missing" };
  }
  if (st.isSymbolicLink()) {
    let bytes: Buffer;
    try {
      bytes = readlinkSync(abs, { encoding: "buffer" });
    } catch {
      return { kind: "missing" };
    }
    return bytes.length > max
      ? { kind: "too-big" }
      : { kind: "symlink", bytes, dev: st.dev, ino: st.ino };
  }
  if (st.isDirectory()) return { kind: "dir" };
  if (!st.isFile()) return { kind: "special" };
  let fd: number;
  try {
    fd = openSync(
      abs,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch {
    return { kind: "special" };
  }
  try {
    const fst = fstatSync(fd);
    if (!fst.isFile()) return { kind: "special" };
    if (fst.size > max) return { kind: "too-big" };
    const bytes = readFdCapped(fd, max);
    if (!bytes) return { kind: "too-big" };
    return {
      kind: "file",
      exec: (fst.mode & 0o100) !== 0,
      bytes,
      dev: fst.dev,
      ino: fst.ino,
    };
  } finally {
    closeSync(fd);
  }
}

/**
 * Why a repo-relative path is unsafe to join onto the checkout (null =
 * fine): relative, normalised ("/" separated, no empty, "." or ".."
 * segment), no NUL/CR/LF, no `.git` segment (case-insensitive).
 */
function relPathProblem(p: unknown): string | null {
  if (typeof p !== "string" || p === "") return "empty path";
  if (p.length > 4096) return "path too long";
  if (/[\0\n\r]/.test(p)) return "path contains NUL or newline";
  if (p.startsWith("/") || isAbsolute(p)) return "path is absolute";
  const segs = p.split("/");
  if (segs.some((s) => s === "" || s === "." || s === "..")) {
    return "path is not normalised";
  }
  if (segs.some((s) => s.toLowerCase() === ".git")) return "path is under .git";
  return null;
}

type ParentState = "ok" | "missing" | "not-real";

/**
 * lstat every directory component of `rel` from the checkout down: a
 * symlink or non-directory component is "not-real" (git never looks
 * through it); the first missing one stops the walk ("missing").
 */
function parentState(
  checkout: string,
  rel: string,
  cache?: Map<string, ParentState>,
): ParentState {
  const segs = rel.split("/").slice(0, -1);
  let dir = checkout;
  let key = "";
  for (const s of segs) {
    dir = join(dir, s);
    key = key ? `${key}/${s}` : s;
    const known = cache?.get(key);
    if (known === "ok") continue;
    if (known) return known;
    let state: ParentState;
    try {
      const st = lstatSync(dir);
      state = st.isDirectory() ? "ok" : "not-real";
    } catch {
      state = "missing";
    }
    cache?.set(key, state);
    if (state !== "ok") return state;
  }
  return "ok";
}

// ─── blob hashing and fingerprint ───────────────────────────────────────

/** git blob id of `bytes` ("blob <len>\0" + bytes) for the object format. */
export function blobHash(bytes: Buffer, format: ObjectFormat): string {
  const h = createHash(format === "sha256" ? "sha256" : "sha1");
  h.update(`blob ${bytes.length}\0`);
  h.update(bytes);
  return h.digest("hex");
}

export type FileMode = "100644" | "100755" | "120000" | "160000";
export interface FileState {
  mode: FileMode;
  hash: string;
}
export type PathState = FileState | "deleted";

/**
 * Working tree vs a known HEAD. `changed` holds every path whose working
 * tree (or index) differs from `head`; `skipped` records what CF did not
 * hash (special files, nested repos, unsafe paths) so it still counts in
 * equality.
 */
export interface ChefFingerprint {
  head: string;
  changed: Record<string, PathState>;
  skipped: string[];
}

export interface FingerprintCaps {
  maxFiles: number;
  maxBytes: number;
  /** Tree objects in the verified base walk (default MAX_TREES). */
  maxTrees?: number;
}

const MAX_TREES = 20_000;

export const FINGERPRINT_CAPS: FingerprintCaps = {
  maxFiles: 50_000,
  maxBytes: 512 * 1024 * 1024,
  maxTrees: MAX_TREES,
};

function treeCaps(caps: FingerprintCaps): TreeWalkCaps {
  return { maxTrees: caps.maxTrees ?? MAX_TREES, maxEntries: caps.maxFiles };
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function sameState(a: PathState | undefined, b: PathState | undefined) {
  if (a === undefined || b === undefined) return a === b;
  if (a === "deleted" || b === "deleted") return a === b;
  return a.mode === b.mode && a.hash === b.hash;
}

/** Mode git would record for a regular file (core.fileMode aware). */
function regularMode(
  exec: boolean,
  fileMode: boolean,
  known: string | undefined,
): FileMode {
  if (fileMode) return exec ? "100755" : "100644";
  return known === "100755" || known === "100644" ? known : "100644";
}

/**
 * Fingerprint of the working tree against `head` (a commit sha resolved
 * once by the caller): the HEAD side comes from the verified tree walk of
 * `head` (the same base commitPaths builds on), the rest from hardened
 * `ls-files -s -z` and `ls-files -o --exclude-standard -z`, hashing
 * working-tree bytes in Node. Over a cap → ChefGitError
 * FINGERPRINT_OVER_CAP; a tampered base object → OBJECT_MISMATCH.
 */
export function computeFingerprint(
  ctx: GitCtx,
  head: string,
  caps: FingerprintCaps = FINGERPRINT_CAPS,
): ChefFingerprint {
  if (!isSha(head)) throw new ChefGitError("INVALID", "head must be a sha");
  const format = gitObjectFormat(ctx);
  const fileMode = configBool(
    configValue(readConfig(ctx).entries, "core.filemode"),
    true,
  );
  const tree = verifiedBase(ctx, format, head, treeCaps(caps)).files;
  const index = readIndex(ctx);
  const others = splitZ(
    git(ctx, ["ls-files", "-o", "--exclude-standard", "-z"]),
  );
  const paths = new Set<string>([...tree.keys(), ...index.keys(), ...others]);
  if (paths.size > caps.maxFiles) {
    throw new ChefGitError(
      "FINGERPRINT_OVER_CAP",
      `working tree has ${paths.size} files (cap ${caps.maxFiles})`,
    );
  }
  const changed: Record<string, PathState> = Object.create(null) as Record<
    string,
    PathState
  >;
  const skipped: string[] = [];
  const parents = new Map<string, ParentState>();
  let bytes = 0;
  for (const p of [...paths].sort()) {
    if (p.endsWith("/")) {
      skipped.push(`nested-repo:${p}`);
      continue;
    }
    if (relPathProblem(p) !== null) {
      skipped.push(`unsafe-path:${JSON.stringify(p)}`);
      continue;
    }
    const t = tree.get(p);
    const i = index.get(p);
    const base: PathState | undefined = t
      ? { mode: t.mode as FileMode, hash: t.sha }
      : undefined;
    const staged: PathState | undefined = i
      ? { mode: i.mode as FileMode, hash: i.sha }
      : undefined;
    const indexDiffers = !!i?.conflict || !sameState(staged, base);
    if (t?.mode === "160000" || i?.mode === "160000") {
      // Gitlink: CF never descends into a submodule; index vs HEAD only.
      if (indexDiffers) changed[p] = staged ?? "deleted";
      continue;
    }
    let state: PathState;
    if (parentState(ctx.checkout, p, parents) !== "ok") {
      state = "deleted";
    } else {
      const r = readNoFollow(join(ctx.checkout, p), caps.maxBytes - bytes);
      if (r.kind === "too-big") {
        throw new ChefGitError(
          "FINGERPRINT_OVER_CAP",
          `working tree is over ${caps.maxBytes} bytes`,
        );
      }
      if (r.kind === "special") {
        skipped.push(`special:${p}`);
        state = "deleted";
      } else if (r.kind === "missing" || r.kind === "dir") {
        state = "deleted";
      } else {
        bytes += r.bytes.length;
        state = {
          mode:
            r.kind === "symlink"
              ? "120000"
              : regularMode(r.exec, fileMode, i?.mode ?? t?.mode),
          hash: blobHash(r.bytes, format),
        };
      }
    }
    const worktreeDiffers = base
      ? !sameState(state, base)
      : state !== "deleted";
    if (indexDiffers || worktreeDiffers) changed[p] = state;
  }
  return { head, changed, skipped };
}

/** Pure equality of two fingerprints (head, every changed entry, skipped). */
export function fingerprintEquals(
  a: ChefFingerprint,
  b: ChefFingerprint,
): boolean {
  if (!a || !b || a.head !== b.head) return false;
  const ka = Object.keys(a.changed ?? {}).sort();
  const kb = Object.keys(b.changed ?? {}).sort();
  if (ka.length !== kb.length || ka.some((k, n) => k !== kb[n])) return false;
  if (!ka.every((k) => sameState(a.changed[k], b.changed[k]))) return false;
  const sa = [...(a.skipped ?? [])].sort();
  const sb = [...(b.skipped ?? [])].sort();
  return sa.length === sb.length && sa.every((s, n) => s === sb[n]);
}

// ─── validation ─────────────────────────────────────────────────────────

/** Steering paths a chef commit may never touch. */
export interface SteeringSpec {
  /** Absolute plan dir (inside the checkout). */
  planDir: string;
  /** Repo core.hooksPath recorded at start (absolute), if any. */
  hooksPath?: string | null;
}

const ROOT_STEERING = new Set([
  "claude.md",
  "claude.local.md",
  "agents.md",
  ".gitmodules",
]);

/**
 * realpath of `p` (native: canonical case, /tmp → /private/tmp), or of its
 * nearest existing ancestor joined with the missing rest.
 */
function realpathLoose(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync.native(abs);
  } catch {
    const parent = dirname(abs);
    return parent === abs ? abs : join(realpathLoose(parent), basename(abs));
  }
}

/** `dir` relative to `root` ("/"-separated); null unless strictly inside. */
function insideRel(root: string, dir: string): string | null {
  const rel = relative(root, dir);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return null;
  }
  return rel.split(sep).join("/");
}

/**
 * Checkout-relative lowercased prefixes of `.githooks`, the plan dir and
 * the repo hooks dir, both sides realpath'd. A plan dir that resolves to
 * the checkout itself or outside it throws INVALID (it would otherwise
 * silently stop being steering); a hooks dir outside the checkout is
 * skipped (it cannot be committed anyway).
 */
function steeringPrefixes(checkout: string, spec: SteeringSpec): string[] {
  if (typeof spec?.planDir !== "string" || !isAbsolute(spec.planDir)) {
    throw new ChefGitError("INVALID", "planDir must be an absolute path");
  }
  const root = realpathLoose(checkout);
  const plan = insideRel(root, realpathLoose(spec.planDir));
  if (plan === null) {
    throw new ChefGitError(
      "INVALID",
      "planDir must resolve to a directory inside the checkout",
    );
  }
  const out = [".githooks", plan];
  if (spec.hooksPath) {
    const hooks = insideRel(root, realpathLoose(spec.hooksPath));
    if (hooks !== null) out.push(hooks);
  }
  return out.map((p) => p.toLowerCase());
}

function isSteeringRel(rel: string, prefixes: string[]): boolean {
  const low = rel.toLowerCase();
  if (ROOT_STEERING.has(low)) return true;
  if (low.split("/").pop() === ".gitattributes") return true;
  return prefixes.some((p) => low === p || low.startsWith(`${p}/`));
}

/**
 * Why `path` cannot be committed (null = fine): must be relative and
 * normalised, no `..`, NUL or newline, not under `.git` (any case), every
 * existing parent a real directory inside the checkout, and not a steering
 * path (plan dir, root CLAUDE.md/CLAUDE.local.md/AGENTS.md/.gitmodules,
 * .githooks or the repo hooks dir, any .gitattributes). Throws INVALID when
 * `steering.planDir` does not resolve strictly inside the checkout.
 */
export function validateCommitPath(
  checkout: string,
  path: string,
  steering: SteeringSpec,
): string | null {
  const problem = relPathProblem(path);
  if (problem) return problem;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path))
    return "path contains control characters";
  if (isSteeringRel(path, steeringPrefixes(checkout, steering))) {
    return "steering path (never committed by a chef)";
  }
  if (parentState(checkout, path) === "not-real") {
    return "a parent directory is a symlink or not a directory";
  }
  return null;
}

/** Why `message` cannot be a chef commit message (null = fine). */
export function validateCommitMessage(message: string): string | null {
  if (typeof message !== "string" || message.trim() === "") {
    return "empty message";
  }
  if (message.length > 100) return "message longer than 100 characters";
  if (
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f\x7f-\x9f\u{2028}\u{2029}\u{202a}-\u{202e}\u{2066}-\u{2069}]/u.test(
      message,
    )
  ) {
    return "message must be one line without control characters";
  }
  return null;
}

// ─── fidelity ───────────────────────────────────────────────────────────

export interface FidelityInput {
  path: string;
  /** Bytes CF will commit (null = deletion); undefined → read here once. */
  bytes?: Buffer | null;
}

const FIDELITY_ATTRS = [
  "filter",
  "ident",
  "working-tree-encoding",
  "text",
  "eol",
  "crlf",
];

function isSpecified(info: string | undefined): boolean {
  return info !== undefined && info !== "unspecified" && info !== "unset";
}

/**
 * Reasons a chef commit of `files` on top of `head` would not match what
 * `git add` + `git commit` would make (empty = fine): a filter / ident /
 * working-tree-encoding attribute (covers LFS), CRLF content where
 * text/eol/core.autocrlf would convert, effective commit.gpgSign=true, or a
 * gitlink/submodule path.
 */
export function checkCommitFidelity(
  ctx: GitCtx,
  head: string,
  files: FidelityInput[],
): string[] {
  if (!isSha(head)) throw new ChefGitError("INVALID", "head must be a sha");
  const format = gitObjectFormat(ctx);
  const base = verifiedBase(ctx, format, head, treeCaps(FINGERPRINT_CAPS));
  return fidelityReasons(ctx, base.files, files);
}

/** checkCommitFidelity against an already verified base tree. */
function fidelityReasons(
  ctx: GitCtx,
  tree: Map<string, TreeEntry>,
  files: FidelityInput[],
): string[] {
  const reasons: string[] = [];
  const { entries } = readConfig(ctx);
  if (configBool(configValue(entries, "commit.gpgsign"), false)) {
    reasons.push("commit.gpgSign is true: chef commits cannot be signed");
  }
  if (files.length === 0) return reasons;
  const autocrlf = configValue(entries, "core.autocrlf");
  const convertsByConfig =
    autocrlf?.trim().toLowerCase() === "input" || configBool(autocrlf, false);

  const out = splitZ(
    git(ctx, ["check-attr", "--stdin", "-z", ...FIDELITY_ATTRS], {
      input: files.map((f) => `${f.path}\0`).join(""),
    }),
  );
  const attrs = new Map<string, Map<string, string>>();
  for (let n = 0; n + 2 < out.length; n += 3) {
    const m = attrs.get(out[n]) ?? new Map<string, string>();
    m.set(out[n + 1], out[n + 2]);
    attrs.set(out[n], m);
  }
  const index = readIndex(ctx);
  for (const f of files) {
    const a = attrs.get(f.path) ?? new Map<string, string>();
    for (const name of ["filter", "ident", "working-tree-encoding"]) {
      if (isSpecified(a.get(name))) {
        reasons.push(`${f.path}: ${name} attribute (${clip(a.get(name)!)})`);
      }
    }
    if (
      tree.get(f.path)?.mode === "160000" ||
      index.get(f.path)?.mode === "160000"
    ) {
      reasons.push(`${f.path}: gitlink/submodule`);
      continue;
    }
    let bytes = f.bytes;
    if (bytes === undefined) {
      const r = readNoFollow(
        join(ctx.checkout, f.path),
        FINGERPRINT_CAPS.maxBytes,
      );
      if (r.kind === "dir") {
        reasons.push(`${f.path}: is a directory (gitlink/submodule?)`);
        continue;
      }
      bytes = r.kind === "file" ? r.bytes : null;
    }
    if (!bytes || !bytes.includes("\r\n")) continue;
    const text = a.get("text");
    const crlf = a.get("crlf");
    if (text === "unset" || crlf === "unset") continue;
    const converts =
      isSpecified(text) ||
      isSpecified(a.get("eol")) ||
      isSpecified(crlf) ||
      ((text === undefined || text === "unspecified") && convertsByConfig);
    if (converts) {
      reasons.push(`${f.path}: CRLF content would be converted by git`);
    }
  }
  return reasons;
}

// ─── snapshots ──────────────────────────────────────────────────────────

/** label → digest; compared with diffSnapshots. */
export type SnapshotEntries = Record<string, string>;

/** What a baseline stores: repo guard + steering. */
export interface ChefSnapshot {
  repo: SnapshotEntries;
  steering: SnapshotEntries;
}

export interface SteeringCaps {
  maxFiles: number;
  maxBytes: number;
  /** Directory entries visited while looking for .gitattributes. */
  maxEntries: number;
}

export const STEERING_CAPS: SteeringCaps = {
  maxFiles: 2_000,
  maxBytes: 32 * 1024 * 1024,
  maxEntries: 500_000,
};

const HOOK_FILE_CAP = 4 * 1024 * 1024;

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Digest of one entry, read without following a final symlink. */
function entryDigest(
  abs: string,
  max: number,
): { digest: string; size: number } {
  const r = readNoFollow(abs, max);
  switch (r.kind) {
    case "file":
      return {
        digest: `f${r.exec ? "x" : ""}:${sha256(r.bytes)}`,
        size: r.bytes.length,
      };
    case "symlink":
      return { digest: `l:${sha256(r.bytes)}`, size: r.bytes.length };
    case "too-big":
      return { digest: "too-big", size: max + 1 };
    default:
      return { digest: r.kind, size: 0 };
  }
}

/** Identity of a path (type + dev/ino), "missing" when absent. */
function identity(abs: string): string {
  try {
    const st = lstatSync(abs);
    const type = st.isDirectory()
      ? "dir"
      : st.isFile()
        ? "file"
        : st.isSymbolicLink()
          ? "symlink"
          : "special";
    return `${type}:${st.dev}:${st.ino}`;
  } catch {
    return "missing";
  }
}

/** Flat listing of a hooks dir (each entry digested). */
function hooksEntries(dir: string, out: SnapshotEntries): void {
  out[`hooks:${dir}`] = identity(dir);
  let names: string[];
  try {
    assertRealDir(dir);
    names = readdirSync(dir).sort();
  } catch {
    return;
  }
  for (const name of names) {
    out[`hooks:${dir}/${name}`] = entryDigest(
      join(dir, name),
      HOOK_FILE_CAP,
    ).digest;
  }
}

/**
 * sha256 of the `config --list --show-origin --show-scope -z` records
 * without scope `command`: those are CF's own `-c` hardening (its hooks dir
 * path differs between `cf chef start` and the wakes), never repo config.
 * Split on raw NUL bytes so no byte is lost to decoding.
 */
function repoConfigDigest(bytes: Buffer): string {
  const fields: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      fields.push(bytes.subarray(start, i));
      start = i + 1;
    }
  }
  if (start < bytes.length) fields.push(bytes.subarray(start));
  const h = createHash("sha256");
  for (let i = 0; i < fields.length; i += 3) {
    if (i + 2 < fields.length && fields[i].toString("latin1") === "command") {
      continue;
    }
    for (const f of fields.slice(i, i + 3)) h.update(f).update("\0");
  }
  return h.digest("hex");
}

/**
 * Repo guard: sha256 of the `config --list --show-origin --show-scope -z`
 * records (CF's own command-line `-c` excluded), the hooks dirs
 * (`<git common dir>/hooks` and the repo's own core.hooksPath, inside the
 * checkout or not), the bytes of `<git common dir>/info/exclude` (a
 * worker could otherwise hide new untracked files from the fingerprint's
 * `ls-files -o --exclude-standard`),
 * the type/identity of the `.git` entry and of the pinned git dir, and the
 * bytes of `<git dir>/commondir` and `<git dir>/HEAD` plus the realpath of
 * the common dir (a linked worktree's objects, refs and hooks live there;
 * a planted `commondir` in a main repo is caught too).
 */
export function snapshotRepoGuard(ctx: GitCtx): SnapshotEntries {
  const { bytes, entries } = readConfig(ctx);
  const out: SnapshotEntries = {};
  out.config = repoConfigDigest(bytes);
  const dotGit = join(ctx.checkout, ".git");
  const id = identity(dotGit);
  out[".git"] = id.startsWith("file:")
    ? `${id}:${entryDigest(dotGit, 64 * 1024).digest}`
    : id;
  let gitDirReal = "unresolvable";
  try {
    gitDirReal = realpathSync(ctx.gitDir);
  } catch {
    // recorded as unresolvable
  }
  out.gitdir = `${gitDirReal}:${identity(ctx.gitDir)}`;
  const common = commonDir(ctx.gitDir);
  out["<gitdir>/commondir"] = entryDigest(
    join(ctx.gitDir, "commondir"),
    4096,
  ).digest;
  out["<gitdir>/HEAD"] = entryDigest(join(ctx.gitDir, "HEAD"), 4096).digest;
  let commonReal = "unresolvable";
  try {
    commonReal = realpathSync.native(common);
  } catch {
    // recorded as unresolvable
  }
  out.commondir = `${commonReal}:${identity(common)}`;
  hooksEntries(join(common, "hooks"), out);
  out["<git>/info/exclude"] = entryDigest(
    join(common, "info", "exclude"),
    HOOK_FILE_CAP,
  ).digest;
  const hp = repoHooksPath(ctx, entries);
  if (hp) hooksEntries(hp, out);
  return out;
}

/**
 * Steering snapshot (defense in depth; chefs never load these files): a
 * direct lstat walk of the checkout (ignored files included, `.git`
 * skipped, symlinks never followed) digesting `planDir/**`, root
 * CLAUDE.md / CLAUDE.local.md / AGENTS.md, `.githooks/**` and the repo
 * hooks dir when inside the checkout, every `.gitattributes`, plus
 * `<git common dir>/info/attributes`. Not `.claude/**`, not nested
 * CLAUDE.md/AGENTS.md. Outside the plan and hooks dirs (and the dirs on
 * the way to them) the walk never enters `node_modules/` or a nested git
 * repository (a directory holding a `.git` entry), so a writer running
 * `npm install` does not pause the chef. git does read a `.gitattributes`
 * under such a dir for paths below it (a planted `.git` does not make it
 * a separate repo for this checkout); the nets for those are the per-path
 * `check-attr` in checkCommitFidelity on every committed path and
 * `fingerprint.skipped` (a real nested repo is skipped there, never
 * committed). A planted `.git` never hides the plan or hooks dir.
 * Over a cap → ChefGitError STEERING_OVER_CAP.
 */
export function snapshotSteering(
  ctx: GitCtx,
  planDir: string,
  caps: SteeringCaps = STEERING_CAPS,
): SnapshotEntries {
  const hooksPath = repoHooksPath(ctx, readConfig(ctx).entries);
  const prefixes = steeringPrefixes(ctx.checkout, { planDir, hooksPath });
  const out: SnapshotEntries = {};
  let files = 0;
  let bytes = 0;
  let visited = 0;
  const over = (what: string): never => {
    throw new ChefGitError(
      "STEERING_OVER_CAP",
      `steering snapshot over ${what}`,
    );
  };
  const add = (key: string, abs: string): void => {
    if (++files > caps.maxFiles) over(`${caps.maxFiles} files`);
    const d = entryDigest(abs, caps.maxBytes - bytes);
    if (d.digest === "too-big") over(`${caps.maxBytes} bytes`);
    bytes += d.size;
    out[key] = d.digest;
  };
  // The plan/hooks dirs, their contents, or a dir on the way to them.
  const mayHoldSteering = (rel: string): boolean => {
    const low = rel.toLowerCase();
    return prefixes.some(
      (p) => p === low || p.startsWith(`${low}/`) || low.startsWith(`${p}/`),
    );
  };
  const stack: string[] = [""];
  while (stack.length) {
    const rel = stack.pop()!;
    let ents: Dirent[];
    try {
      ents = readdirSync(rel ? join(ctx.checkout, rel) : ctx.checkout, {
        withFileTypes: true,
      });
    } catch {
      out[`${rel}/`] = "unreadable";
      continue;
    }
    // Nested git repository (dir or linked-worktree `.git` file): skipped.
    if (
      rel &&
      !mayHoldSteering(rel) &&
      ents.some((e) => e.name.toLowerCase() === ".git")
    ) {
      continue;
    }
    for (const e of ents) {
      if (++visited > caps.maxEntries) over(`${caps.maxEntries} entries`);
      if (e.name.toLowerCase() === ".git") continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name === "node_modules" && !mayHoldSteering(childRel)) continue;
        stack.push(childRel);
      } else if (isSteeringRel(childRel, prefixes)) {
        add(childRel, join(ctx.checkout, childRel));
      }
    }
  }
  add(
    "<git>/info/attributes",
    join(commonDir(ctx.gitDir), "info", "attributes"),
  );
  return out;
}

/** Labels whose digest differs between two snapshots (added/removed too). */
export function diffSnapshots(
  a: SnapshotEntries,
  b: SnapshotEntries,
): string[] {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys]
    .filter((k) => !hasOwn(a ?? {}, k) || !hasOwn(b ?? {}, k) || a[k] !== b[k])
    .sort();
}

// ─── commitPaths ────────────────────────────────────────────────────────

export interface CommitPathsInput {
  ctx: GitCtx;
  /** Chef id (temp index under chefs/<id>/private/<n>/, reflog message). */
  id: string;
  /** Wake number. */
  n: number;
  paths: string[];
  message: string;
  /** Latest known sha of refs/heads/<branch>, resolved once by the caller. */
  expectedHead: string;
  /** Branch recorded at `cf chef start`. */
  branch: string;
  /** Fingerprint the commit gate approved (head must be expectedHead). */
  gateFingerprint: ChefFingerprint;
  /** Steering paths never committed. */
  steering: SteeringSpec;
}

interface CommitDone {
  commit: string;
  tree: string;
  parent: string;
  paths: string[];
}

export type CommitPathsResult =
  | ({ kind: "committed" } & CommitDone)
  /** Nothing committed: bytes/ref/tree differed from what the gate saw. */
  | { kind: "mismatch"; reason: string }
  /**
   * Nothing committed: invalid input, fidelity refusal, gitlink, index-only
   * change, or "object store tampered: ..." (OBJECT_MISMATCH).
   */
  | { kind: "refused"; reasons: string[] }
  /** Commit landed on refs/heads/<branch>, the real index was not synced. */
  | ({ kind: "committed-index-sync-failed"; error: string } & CommitDone);

interface ReadPath {
  path: string;
  /** null = deletion. */
  bytes: Buffer | null;
  state: PathState;
}

/** `abs` (not followed) is still the inode that was read. */
function sameInode(abs: string, dev: number, ino: number): boolean {
  try {
    const st = lstatSync(abs);
    return st.dev === dev && st.ino === ino;
  } catch {
    return false;
  }
}

/** Read every path once and compare with the gate (null = all match). */
function readGatedPaths(
  ctx: GitCtx,
  input: CommitPathsInput,
  format: ObjectFormat,
  fileMode: boolean,
): { files: ReadPath[] } | { mismatch: string } {
  const files: ReadPath[] = [];
  for (const p of input.paths) {
    const want = input.gateFingerprint.changed[p];
    const parent = parentState(ctx.checkout, p);
    if (parent === "not-real") {
      return {
        mismatch: `${p}: a parent directory is no longer a real directory`,
      };
    }
    if (want === "deleted") {
      // A directory at the path is "deleted" for the fingerprint too.
      const now =
        parent === "ok"
          ? readNoFollow(join(ctx.checkout, p), 0).kind
          : "missing";
      if (now !== "missing" && now !== "dir") {
        return { mismatch: `${p}: exists again since the gate` };
      }
      files.push({ path: p, bytes: null, state: "deleted" });
      continue;
    }
    const r =
      parent === "ok"
        ? readNoFollow(join(ctx.checkout, p), FINGERPRINT_CAPS.maxBytes)
        : ({ kind: "missing" } as const);
    if (r.kind !== "file" && r.kind !== "symlink") {
      return { mismatch: `${p}: is ${r.kind}, the gate saw a file` };
    }
    // No openat in Node: narrow a parent swap around the read.
    if (
      !sameInode(join(ctx.checkout, p), r.dev, r.ino) ||
      parentState(ctx.checkout, p) !== "ok"
    ) {
      return { mismatch: `${p}: path was swapped while it was read` };
    }
    const state: FileState = {
      mode:
        r.kind === "symlink"
          ? "120000"
          : regularMode(r.exec, fileMode, want.mode),
      hash: blobHash(r.bytes, format),
    };
    if (!sameState(state, want)) {
      return { mismatch: `${p}: changed between the gate and the commit` };
    }
    files.push({ path: p, bytes: r.bytes, state });
  }
  return { files };
}

function updateIndexArgs(files: ReadPath[]): string[][] {
  const adds = files.filter((f) => f.state !== "deleted");
  const dels = files.filter((f) => f.state === "deleted");
  const calls: string[][] = [];
  if (adds.length) {
    calls.push([
      "update-index",
      "--add",
      ...adds.flatMap((f) => {
        const s = f.state as FileState;
        return ["--cacheinfo", `${s.mode},${s.hash},${f.path}`];
      }),
    ]);
  }
  if (dels.length) {
    calls.push([
      "update-index",
      "--force-remove",
      "--",
      ...dels.map((f) => f.path),
    ]);
  }
  return calls;
}

/**
 * Refusals against the verified base before any path is read: a gitlink
 * (base, index or gate entry) and a path whose only change is in the index
 * (the working tree matches HEAD, so a commit of it would change nothing).
 */
function baseRefusals(
  paths: string[],
  changed: Record<string, PathState>,
  base: Map<string, TreeEntry>,
  index: Map<string, IndexEntry>,
): string[] {
  const reasons: string[] = [];
  for (const p of paths) {
    const want = changed[p];
    const b = base.get(p);
    if (
      (want !== "deleted" && want?.mode === "160000") ||
      b?.mode === "160000" ||
      index.get(p)?.mode === "160000"
    ) {
      reasons.push(`${p}: gitlink/submodule`);
      continue;
    }
    const baseState: PathState | undefined = b
      ? { mode: b.mode as FileMode, hash: b.sha }
      : undefined;
    if (want === "deleted" ? !b : sameState(want, baseState)) {
      reasons.push(
        `${p}: only the index differs from HEAD (the working tree matches HEAD)`,
      );
    }
  }
  return reasons;
}

/** Same path → {mode, sha} maps. */
function sameFiles(
  a: Map<string, TreeEntry>,
  b: Map<string, TreeEntry>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [p, e] of a) {
    const o = b.get(p);
    if (!o || o.mode !== e.mode || o.sha !== e.sha) return false;
  }
  return true;
}

/** The commit object CF just built: exactly tree, one parent, message. */
function checkBuiltCommit(
  body: Buffer,
  commit: string,
  tree: string,
  parent: string,
  message: string,
): void {
  const split = body.indexOf("\n\n");
  const headers =
    split === -1 ? [] : body.subarray(0, split).toString("utf-8").split("\n");
  const ok =
    split !== -1 &&
    headers[0] === `tree ${tree}` &&
    headers[1] === `parent ${parent}` &&
    !!headers[2]?.startsWith("author ") &&
    !!headers[3]?.startsWith("committer ") &&
    headers.slice(4).every((h) => h.startsWith("encoding ")) &&
    body.subarray(split + 2).toString("utf-8") === `${message}\n`;
  if (!ok) tampered(`commit ${commit} is not the commit CF built`);
}

/**
 * Build and land a commit of exactly `paths` with plumbing only: checks
 * `symbolic-ref HEAD` is refs/heads/<branch> before and after; reads the
 * `expectedHead` commit and every tree under it verified (hash recomputed
 * in Node) and builds the temp index from `read-tree <verified tree>`;
 * refuses gitlinks and index-only changes; reads every path once and
 * compares it with the gate fingerprint; writes those exact bytes with
 * `hash-object -w --stdin --no-filters` (sha asserted, object read back
 * verified and compared byte for byte); `update-index --cacheinfo` /
 * `--force-remove`; `write-tree`, whose tree is walked verified and must
 * equal the verified base with exactly `paths` changed; `diff-index
 * --cached --name-only` must list exactly `paths`; `commit-tree -p
 * <expectedHead> -F -` (commit read back verified); then compare-and-swaps
 * refs/heads/<branch> and syncs the real index for those paths. A tampered
 * object returns `refused` ("object store tampered: ..."), nothing
 * committed. Never uses the name HEAD in the commit path, never runs
 * hooks/filters/gpg, never pushes or branches. Throws INVALID when
 * `steering.planDir` is not strictly inside the checkout.
 */
export function commitPaths(input: CommitPathsInput): CommitPathsResult {
  const { ctx, branch, expectedHead } = input;
  if (!isSha(expectedHead) || !isBranchName(branch)) {
    return { kind: "refused", reasons: ["invalid expected HEAD or branch"] };
  }
  const reasons: string[] = [];
  const msgProblem = validateCommitMessage(input.message);
  if (msgProblem) reasons.push(`message: ${msgProblem}`);
  const paths = Array.isArray(input.paths) ? input.paths : [];
  if (paths.length === 0) reasons.push("no paths");
  if (new Set(paths).size !== paths.length) reasons.push("duplicate paths");
  const changed = input.gateFingerprint?.changed ?? {};
  const { entries } = readConfig(ctx);
  // The repo's current core.hooksPath is steering even if the caller's spec lacks it.
  const repoHooks = repoHooksPath(ctx, entries);
  for (const p of paths) {
    const problem =
      validateCommitPath(ctx.checkout, p, input.steering) ??
      (repoHooks
        ? validateCommitPath(ctx.checkout, p, {
            planDir: input.steering.planDir,
            hooksPath: repoHooks,
          })
        : null);
    if (problem) reasons.push(`${String(p)}: ${problem}`);
    else if (!hasOwn(changed, p)) reasons.push(`${p}: not a changed path`);
  }
  if (reasons.length) return { kind: "refused", reasons };
  if (input.gateFingerprint.head !== expectedHead) {
    return { kind: "mismatch", reason: "gate fingerprint is for another HEAD" };
  }
  const ref = `refs/heads/${branch}`;
  if (readSymbolicHead(ctx) !== ref) {
    return { kind: "mismatch", reason: `HEAD does not point to ${ref}` };
  }

  const format = gitObjectFormat(ctx);
  const fileMode = configBool(configValue(entries, "core.filemode"), true);
  const caps = treeCaps(FINGERPRINT_CAPS);
  const refusal = (err: unknown): CommitPathsResult => {
    if (
      err instanceof ChefGitError &&
      (err.kind === "OBJECT_MISMATCH" || err.kind === "FINGERPRINT_OVER_CAP")
    ) {
      return { kind: "refused", reasons: [err.message] };
    }
    throw err;
  };
  let base: VerifiedBase;
  try {
    base = verifiedBase(ctx, format, expectedHead, caps);
  } catch (err) {
    return refusal(err);
  }
  const early = baseRefusals(paths, changed, base.files, readIndex(ctx));
  if (early.length) return { kind: "refused", reasons: early };
  const read = readGatedPaths(ctx, input, format, fileMode);
  if ("mismatch" in read) return { kind: "mismatch", reason: read.mismatch };
  const fidelity = fidelityReasons(ctx, base.files, read.files);
  if (fidelity.length) return { kind: "refused", reasons: fidelity };

  // Only the temp index is removed here; the wake owns chefs/<id>/private/<n>/.
  const indexFile = join(
    makeChefPrivateDir(input.id, input.n),
    `index-${randomBytes(6).toString("hex")}`,
  );
  try {
    const temp = { indexFile };
    git(ctx, ["read-tree", base.tree], temp);
    for (const f of read.files) {
      if (!f.bytes) continue;
      const sha = git(ctx, ["hash-object", "-w", "--stdin", "--no-filters"], {
        input: f.bytes,
      })
        .toString("utf-8")
        .trim();
      if (sha !== (f.state as FileState).hash) {
        return {
          kind: "mismatch",
          reason: `${f.path}: hash-object returned another sha`,
        };
      }
      // A pre-planted object under this name is kept by hash-object as is.
      const stored = readObjectVerified(
        ctx,
        format,
        sha,
        "blob",
        f.bytes.length + 1024,
      );
      if (!stored.equals(f.bytes)) tampered(`${f.path}: blob ${sha} differs`);
    }
    const calls = updateIndexArgs(read.files);
    for (const args of calls) git(ctx, args, temp);
    const tree = git(ctx, ["write-tree"], temp).toString("utf-8").trim();
    if (!isSha(tree))
      throw new ChefGitError("GIT_FAILED", "write-tree gave no sha");
    const expected = new Map(base.files);
    for (const f of read.files) {
      if (f.state === "deleted") expected.delete(f.path);
      else expected.set(f.path, { mode: f.state.mode, sha: f.state.hash });
    }
    const built = walkTreeVerified(ctx, format, tree, caps, base.cache);
    if (!sameFiles(built, expected)) {
      tampered("written tree is not the verified base plus the listed paths");
    }
    const diff = splitZ(
      git(
        ctx,
        [
          "diff-index",
          "--cached",
          "--name-only",
          "-z",
          "--no-ext-diff",
          "--no-textconv",
          "--no-renames",
          base.tree,
        ],
        temp,
      ),
    ).sort();
    const want = [...paths].sort();
    if (diff.length !== want.length || diff.some((p, k) => p !== want[k])) {
      return {
        kind: "mismatch",
        reason: "temp index changes differ from the listed paths",
      };
    }
    const commit = git(
      ctx,
      ["commit-tree", tree, "-p", expectedHead, "--no-gpg-sign", "-F", "-"],
      { input: `${input.message}\n` },
    )
      .toString("utf-8")
      .trim();
    if (!isSha(commit))
      throw new ChefGitError("GIT_FAILED", "commit-tree gave no sha");
    checkBuiltCommit(
      readObjectVerified(ctx, format, commit, "commit"),
      commit,
      tree,
      expectedHead,
      input.message,
    );
    const cas = gitRun({
      ...ctxOnly(ctx),
      args: [
        "update-ref",
        "--no-deref",
        "-m",
        `cf chef ${input.id}`,
        ref,
        commit,
        expectedHead,
      ],
    });
    if (cas.status !== 0) {
      return {
        kind: "mismatch",
        reason: `${ref} moved (compare-and-swap failed): ${cas.stderr}`,
      };
    }
    const done: CommitDone = {
      commit,
      tree,
      parent: expectedHead,
      paths: want,
    };
    // The commit has landed: from here nothing may throw.
    try {
      if (readSymbolicHead(ctx) !== ref) {
        return {
          kind: "committed-index-sync-failed",
          ...done,
          error: `HEAD no longer points to ${ref}; real index not synced`,
        };
      }
      for (const args of calls) git(ctx, args);
    } catch (err) {
      return {
        kind: "committed-index-sync-failed",
        ...done,
        error: err instanceof Error ? clip(err.message) : "index sync failed",
      };
    }
    return { kind: "committed", ...done };
  } catch (err) {
    return refusal(err);
  } finally {
    for (const f of [indexFile, `${indexFile}.lock`]) {
      try {
        unlinkSync(f);
      } catch {
        // not created
      }
    }
  }
}
