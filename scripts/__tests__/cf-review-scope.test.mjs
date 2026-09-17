/**
 * Scope/assessment regression tests for the cf-review diff pipeline.
 *
 * Exercises plugin/skills/cf-review/scripts/{gather-diff,assess-changes}.sh
 * against throwaway git repositories under os.tmpdir().
 *
 * Task 1.2 added the explicit target contract (--uncommitted / --range / --path
 * / --snapshot-dir) and removed the duplicated staged section.
 *
 * Task 1.3 made assess-changes.sh measure the SAME capture (no second
 * `git diff`), so no expected-fail `{ todo: true }` area remains.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const gatherScript = path.join(
  repoRoot,
  "plugin/skills/cf-review/scripts/gather-diff.sh",
);
const assessScript = path.join(
  repoRoot,
  "plugin/skills/cf-review/scripts/assess-changes.sh",
);
const buildPromptScript = path.join(
  repoRoot,
  "plugin/skills/cf-review-out/scripts/build-review-prompt.sh",
);

// Isolate fixtures from the developer's global/system git config (gpg signing,
// hooksPath, aliases) — for both the setup commands and the scripts under test.
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

// Metadata keys consumed by plugin/skills/cf-review-out/scripts/build-review-prompt.sh
const REQUIRED_METADATA_KEYS = [
  "has_committed",
  "commit_range",
  "has_uncommitted",
  "has_staged",
  "has_untracked",
  "base_branch",
  "current_branch",
  "head_sha",
];

function git(cwd, args) {
  const res = spawnSync("git", args, { cwd, env: gitEnv, encoding: "utf8" });
  assert.equal(
    res.status,
    0,
    `git ${args.join(" ")} failed: ${res.stderr || res.stdout}`,
  );
  return res.stdout;
}

function runScript(script, cwd) {
  return spawnSync("bash", [script], {
    cwd,
    env: gitEnv,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

const gather = (cwd) => runScript(gatherScript, cwd);
const assess = (cwd) => runScript(assessScript, cwd);

/** Run gather-diff.sh with explicit target flags. */
function gatherWith(cwd, args, extraEnv = {}) {
  return spawnSync("bash", [gatherScript, ...args], {
    cwd,
    env: { ...gitEnv, ...extraEnv },
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

/** Run assess-changes.sh with explicit flags. */
function assessWith(cwd, args) {
  return spawnSync("bash", [assessScript, ...args], {
    cwd,
    env: gitEnv,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

/** Parse `key=value` lines out of the `=== METADATA ===` block. */
function parseMetadata(stdout) {
  const match = stdout.match(
    /^=== METADATA ===$([\s\S]*?)^=== END METADATA ===$/m,
  );
  assert.ok(match, "no METADATA block in gather-diff output");
  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) meta[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return meta;
}

/** Parse the `KEY=value` lines emitted by assess-changes.sh. */
function parseAssess(stdout) {
  const out = {};
  for (const line of stdout.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

function assertMetadataContract(result) {
  const meta = parseMetadata(result.stdout);
  for (const key of REQUIRED_METADATA_KEYS) {
    assert.ok(
      Object.hasOwn(meta, key),
      `metadata is missing key consumed by build-review-prompt.sh: ${key}`,
    );
  }
  return meta;
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

/**
 * Create a throwaway repo, run `fn(repoDir)`, and always remove exactly the
 * directory this helper created.
 */
function withRepo(fn, { commit = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-review-scope-"));
  try {
    git(dir, ["init", "-b", "main", "-q", "."]);
    git(dir, ["config", "user.name", "CF Fixture"]);
    git(dir, ["config", "user.email", "fixture@example.invalid"]);
    if (commit) {
      fs.writeFileSync(path.join(dir, "base.txt"), "base\n");
      git(dir, ["add", "base.txt"]);
      git(dir, ["commit", "-q", "-m", "initial"]);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("staged-only changes: metadata contract and clean exit", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "base.txt"), "base\nstaged line\n");
    git(dir, ["add", "base.txt"]);

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_staged, "true");
    assert.equal(meta.has_uncommitted, "true");
    assert.equal(meta.has_untracked, "false");
    assert.equal(meta.current_branch, "main");
    assert.match(meta.head_sha, /^[0-9a-f]{7,}$/);
  });
});

// TODO(task 1.2): gather-diff.sh emits `git diff HEAD` (which already contains
// the staged hunks) and then appends `git diff --staged`, so every staged hunk
// is sent to the reviewer twice. 1.2 drops the duplicated section.
test("staged hunks appear exactly once", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "base.txt"), "base\nZZ_MARKER_7f3a\n");
    git(dir, ["add", "base.txt"]);

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      countOccurrences(result.stdout, "+ZZ_MARKER_7f3a"),
      1,
      "staged hunk must be emitted exactly once",
    );
  });
});

test("mixed staged + unstaged changes are both reported", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "staged.txt"), "staged content\n");
    git(dir, ["add", "staged.txt"]);
    fs.writeFileSync(path.join(dir, "base.txt"), "base\nunstaged edit\n");

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_staged, "true");
    assert.equal(meta.has_uncommitted, "true");
    assert.ok(
      result.stdout.includes("unstaged edit"),
      "unstaged hunk missing from gather output",
    );
    assert.ok(
      result.stdout.includes("staged content"),
      "staged hunk missing from gather output",
    );
  });
});

test("untracked file is flagged and its content is included", () => {
  withRepo((dir) => {
    const lines = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`);
    fs.writeFileSync(path.join(dir, "notes-long.txt"), `${lines.join("\n")}\n`);

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_untracked, "true");
    assert.ok(
      result.stdout.includes("--- new file: notes-long.txt"),
      "untracked file header missing",
    );
    assert.ok(
      result.stdout.includes("line 400"),
      "untracked file content missing",
    );

    const metrics = assess(dir);
    assert.equal(metrics.status, 0, metrics.stderr);
    assert.ok(
      parseAssess(metrics.stdout).MODE,
      "assess-changes must always emit MODE",
    );
  });
});

test("400-line untracked file classifies as DEEP", () => {
  withRepo((dir) => {
    const lines = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`);
    fs.writeFileSync(path.join(dir, "notes-long.txt"), `${lines.join("\n")}\n`);

    const metrics = assess(dir);
    assert.equal(metrics.status, 0, metrics.stderr);
    assert.equal(parseAssess(metrics.stdout).MODE, "DEEP");
  });
});

test("feature branch with commits reports a commit range vs main", () => {
  withRepo((dir) => {
    git(dir, ["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "feature.txt"), "feature work\n");
    git(dir, ["add", "feature.txt"]);
    git(dir, ["commit", "-q", "-m", "feat: add feature"]);

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_committed, "true");
    assert.equal(meta.base_branch, "main");
    assert.equal(meta.current_branch, "feature");
    assert.match(meta.commit_range, /^[0-9a-f]{7}\.\.[0-9a-f]{7,}$/);
    assert.ok(
      result.stdout.includes("feature work"),
      "committed branch change missing from gather output",
    );
  });
});

// Explicit range / path targets get their own flags in task 1.2. Today the
// scripts take no arguments, so this fixture only pins the legacy no-arg
// behaviour that 1.2 must keep working for cf-review-out.
test("multi-path history: no-arg run stays legacy-compatible", () => {
  withRepo((dir) => {
    fs.mkdirSync(path.join(dir, "src"));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(path.join(dir, "src/app.js"), "const a = 1;\n");
    fs.writeFileSync(path.join(dir, "docs/readme.md"), "# docs\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "chore: seed paths"]);
    fs.writeFileSync(path.join(dir, "src/app.js"), "const a = 2;\n");

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_uncommitted, "true");
    assert.ok(result.stdout.includes("=== git log --oneline -10 ==="));

    const metrics = parseAssess(assess(dir).stdout);
    assert.equal(metrics.FILES_CHANGED, "1");
    assert.ok(metrics.CHANGED_FILES.includes("src/app.js"));
  });
});

test("empty repo with no HEAD still emits the metadata contract", () => {
  withRepo(
    (dir) => {
      const result = gather(dir);
      // Legacy quirk: the script's last command is `git log`, which exits 128 on
      // an unborn branch, so the script inherits 128. Task 1.2 handles the
      // no-HEAD case explicitly (diff against the empty tree).
      const meta = assertMetadataContract(result);
      assert.equal(meta.has_committed, "false");
      assert.equal(meta.has_uncommitted, "false");
      assert.equal(meta.head_sha, "");

      const metrics = assess(dir);
      assert.equal(
        metrics.status,
        0,
        "assess-changes must not crash without HEAD",
      );
      assert.equal(parseAssess(metrics.stdout).MODE, "QUICK");
    },
    { commit: false },
  );
});

test("deleted file is reported as an uncommitted change", () => {
  withRepo((dir) => {
    fs.rmSync(path.join(dir, "base.txt"));

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_uncommitted, "true");
    assert.ok(
      result.stdout.includes("deleted file mode") ||
        result.stdout.includes("--- a/base.txt"),
      "deletion missing from gather output",
    );

    const metrics = parseAssess(assess(dir).stdout);
    assert.equal(metrics.FILES_CHANGED, "1");
  });
});

test("renamed file does not crash gather or assess", () => {
  withRepo((dir) => {
    fs.writeFileSync(
      path.join(dir, "original.txt"),
      Array.from({ length: 30 }, (_, i) => `content ${i}`).join("\n"),
    );
    git(dir, ["add", "original.txt"]);
    git(dir, ["commit", "-q", "-m", "chore: add original"]);
    git(dir, ["mv", "original.txt", "renamed.txt"]);

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_staged, "true");

    const metrics = assess(dir);
    assert.equal(metrics.status, 0, metrics.stderr);
    assert.ok(parseAssess(metrics.stdout).MODE);
  });
});

test("binary file content is omitted, not dumped", () => {
  withRepo((dir) => {
    fs.writeFileSync(
      path.join(dir, "blob.bin"),
      Buffer.from([0, 1, 2, 3, 0, 255, 254, 0, 7]),
    );

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_untracked, "true");
    assert.ok(
      result.stdout.includes("blob.bin (binary, content omitted)"),
      "binary untracked file must be listed without content",
    );
  });
});

test("paths with spaces and non-ASCII characters do not crash the scripts", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "with space.txt"), "spaced content\n");
    fs.writeFileSync(path.join(dir, "café-ünïcode.txt"), "unicode content\n");

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_untracked, "true");
    assert.ok(
      result.stdout.includes("with space.txt"),
      "space-containing path missing from untracked listing",
    );
    // `git ls-files --others` quote-escapes non-ASCII paths unless -z is used,
    // which used to make `cat "$file"` silently drop their content (task 1.2).
    assert.ok(
      result.stdout.includes("café-ünïcode.txt"),
      "non-ASCII path must be listed unquoted",
    );
    assert.ok(
      result.stdout.includes("unicode content"),
      "non-ASCII untracked file content must be captured",
    );
    assert.ok(
      result.stdout.includes("spaced content"),
      "space-containing untracked file content must be captured",
    );

    const metrics = assess(dir);
    assert.equal(metrics.status, 0, metrics.stderr);
    assert.ok(parseAssess(metrics.stdout).MODE);
  });
});

// ── Task 1.2: explicit target contract, snapshot, no duplication ────────────

test("every hunk appears exactly once across all sections", () => {
  withRepo((dir) => {
    git(dir, ["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "committed.txt"), "COMMITTED_MARK_a1\n");
    git(dir, ["add", "committed.txt"]);
    git(dir, ["commit", "-q", "-m", "feat: committed"]);
    fs.writeFileSync(path.join(dir, "staged.txt"), "STAGED_MARK_b2\n");
    git(dir, ["add", "staged.txt"]);
    fs.writeFileSync(path.join(dir, "base.txt"), "base\nUNSTAGED_MARK_c3\n");

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    for (const marker of [
      "+COMMITTED_MARK_a1",
      "+STAGED_MARK_b2",
      "+UNSTAGED_MARK_c3",
    ]) {
      assert.equal(
        countOccurrences(result.stdout, marker),
        1,
        `${marker} must be emitted exactly once`,
      );
    }
    assert.ok(
      !result.stdout.includes("=== git diff --staged ==="),
      "the duplicated staged section must be gone",
    );
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_staged, "true", "has_staged must stay accurate");
  });
});

test("a change staged then reverted unstaged produces no hunk", () => {
  withRepo((dir) => {
    const file = path.join(dir, "base.txt");
    fs.writeFileSync(file, "base\nTRANSIENT_MARK_d4\n");
    git(dir, ["add", "base.txt"]);
    fs.writeFileSync(file, "base\n"); // revert in the working tree only

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      countOccurrences(result.stdout, "TRANSIENT_MARK_d4"),
      0,
      "net HEAD -> worktree diff must not show a reverted staged change",
    );
    assert.equal(assertMetadataContract(result).has_uncommitted, "false");
  });
});

test("--path limits the uncommitted scope to the target", () => {
  withRepo((dir) => {
    fs.mkdirSync(path.join(dir, "src"));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(path.join(dir, "src/app.js"), "const a = 1;\n");
    fs.writeFileSync(path.join(dir, "docs/readme.md"), "# docs\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "chore: seed"]);
    fs.writeFileSync(path.join(dir, "src/app.js"), "const a = IN_SCOPE;\n");
    fs.writeFileSync(path.join(dir, "docs/readme.md"), "# OUT_OF_SCOPE\n");
    fs.writeFileSync(
      path.join(dir, "docs/extra.md"),
      "OUT_OF_SCOPE untracked\n",
    );

    const result = gatherWith(dir, ["--uncommitted", "--path", "src"]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("IN_SCOPE"), "target path missing");
    assert.ok(
      !result.stdout.includes("OUT_OF_SCOPE"),
      "output must not exceed the --path target",
    );
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_uncommitted, "true");
    assert.equal(meta.has_untracked, "false");
  });
});

test("--range covers only the range and never untracked files", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "first.txt"), "OLD_COMMIT_MARK\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "chore: first"]);
    fs.writeFileSync(path.join(dir, "second.txt"), "RANGE_MARK\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "chore: second"]);
    fs.writeFileSync(path.join(dir, "untracked.txt"), "UNTRACKED_MARK\n");
    fs.writeFileSync(path.join(dir, "first.txt"), "WORKTREE_MARK\n");

    const result = gatherWith(dir, ["--range", "HEAD~1..HEAD"]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("RANGE_MARK"), "range content missing");
    assert.ok(
      !result.stdout.includes("UNTRACKED_MARK"),
      "--range must not pull in untracked files",
    );
    assert.ok(
      !result.stdout.includes("WORKTREE_MARK"),
      "--range must not pull in uncommitted changes",
    );
    const meta = assertMetadataContract(result);
    assert.equal(meta.has_committed, "true");
    assert.equal(meta.commit_range, "HEAD~1..HEAD");
    assert.equal(meta.has_uncommitted, "false");
    assert.equal(meta.has_untracked, "false");
  });
});

test("--snapshot-dir writes a reusable scope snapshot", () => {
  withRepo((dir) => {
    const snapshotDir = path.join(dir, "..", `cf-snap-${process.pid}`);
    try {
      fs.writeFileSync(path.join(dir, "base.txt"), "base\nSNAP_MARK\n");
      fs.writeFileSync(path.join(dir, "new file.txt"), "brand new\n");

      const result = gatherWith(dir, ["--snapshot-dir", snapshotDir]);
      assert.equal(result.status, 0, result.stderr);

      const diffTxt = fs.readFileSync(
        path.join(snapshotDir, "diff.txt"),
        "utf8",
      );
      assert.equal(
        diffTxt,
        result.stdout,
        "diff.txt must match stdout byte for byte",
      );

      const meta = {};
      for (const line of fs
        .readFileSync(path.join(snapshotDir, "metadata.txt"), "utf8")
        .split("\n")) {
        const idx = line.indexOf("=");
        if (idx > 0) meta[line.slice(0, idx)] = line.slice(idx + 1);
      }
      assert.equal(meta.scope_version, "1", "metadata contract is version 1");
      assert.equal(meta.scope_mode, "legacy");
      assert.equal(meta.scope_complete, "true");
      assert.equal(meta.base_ref, "HEAD");

      // NUL-separated so paths are never split on whitespace.
      const files = fs
        .readFileSync(path.join(snapshotDir, "files.z"), "utf8")
        .split("\0")
        .filter(Boolean);
      assert.ok(
        files.some((r) => r === "uncommitted 1 0 base.txt"),
        `tracked numstat row missing: ${JSON.stringify(files)}`,
      );
      assert.ok(
        files.some(
          (r) => r.startsWith("untracked ") && r.endsWith("new file.txt"),
        ),
        `untracked row with a space in the path missing: ${JSON.stringify(files)}`,
      );
      assert.equal(
        parseMetadata(result.stdout).snapshot_dir,
        snapshotDir,
        "METADATA must advertise the snapshot dir",
      );
    } finally {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
  });
});

test("binary untracked files are numstat-only in the snapshot", () => {
  withRepo((dir) => {
    const snapshotDir = path.join(dir, "..", `cf-snap-bin-${process.pid}`);
    try {
      fs.writeFileSync(
        path.join(dir, "blob.bin"),
        Buffer.from([0, 1, 2, 3, 0, 255, 254, 0, 7]),
      );
      const result = gatherWith(dir, ["--snapshot-dir", snapshotDir]);
      assert.equal(result.status, 0, result.stderr);
      const files = fs
        .readFileSync(path.join(snapshotDir, "files.z"), "utf8")
        .split("\0")
        .filter(Boolean);
      assert.ok(
        files.includes("untracked - - blob.bin"),
        `binary must be distinguishable from text untracked: ${JSON.stringify(files)}`,
      );
    } finally {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
  });
});

test("an unusable snapshot dir degrades to stdout instead of failing", () => {
  withRepo((dir) => {
    const blocker = path.join(dir, "..", `cf-snap-file-${process.pid}`);
    fs.writeFileSync(blocker, "not a directory\n");
    try {
      fs.writeFileSync(path.join(dir, "base.txt"), "base\nFALLBACK_MARK\n");
      const result = gatherWith(dir, ["--snapshot-dir", blocker]);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(
        result.stdout.includes("FALLBACK_MARK"),
        "in-memory content must still be emitted",
      );
      assert.match(result.stderr, /WARNING/, "the limitation must be reported");
      assert.equal(parseMetadata(result.stdout).snapshot_dir, "");
    } finally {
      fs.rmSync(blocker, { force: true });
    }
  });
});

test("untracked symlinks are listed but never dereferenced", () => {
  withRepo((dir) => {
    fs.symlinkSync("/etc/passwd", path.join(dir, "escape-link"));

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes("escape-link (symlink, content omitted)"),
      "symlink must be listed without content",
    );
    assert.ok(
      !result.stdout.includes("root:"),
      "an out-of-repo symlink target must never be read",
    );
  });
});

test("legacy no-arg output is still consumable by build-review-prompt.sh", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "base.txt"), "base\nPROMPT_MARK\n");
    git(dir, ["add", "base.txt"]);
    fs.writeFileSync(path.join(dir, "extra.txt"), "untracked body\n");

    const gathered = gather(dir);
    assert.equal(gathered.status, 0, gathered.stderr);

    const prompt = spawnSync(
      "bash",
      [buildPromptScript, "2026-09-15-review", "docs"],
      {
        cwd: dir,
        env: gitEnv,
        input: gathered.stdout,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    assert.equal(prompt.status, 0, prompt.stderr);
    assert.ok(
      prompt.stdout.includes("**Staged changes**: YES"),
      "has_staged must still drive the staged bullet",
    );
    assert.ok(
      prompt.stdout.includes("**Untracked files**: YES"),
      "has_untracked must still drive the untracked bullet",
    );
    assert.ok(
      prompt.stdout.includes("PROMPT_MARK"),
      "the diff body must reach the prompt",
    );
    assert.ok(
      !prompt.stdout.includes("=== git diff --staged ==="),
      "the prompt must not describe a section gather-diff no longer emits",
    );
    assert.equal(
      countOccurrences(prompt.stdout, "+PROMPT_MARK"),
      1,
      "the prompt must not repeat the staged hunk",
    );
  });
});

test("missing git is a real error, not an empty-clean result", () => {
  withRepo((dir) => {
    const result = spawnSync("/bin/bash", [gatherScript], {
      cwd: dir,
      env: { PATH: "/var/empty", HOME: process.env.HOME ?? "/tmp" },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, "missing git must fail");
    assert.match(result.stderr, /ERROR/);
    assert.ok(
      !result.stdout.includes("=== METADATA ==="),
      "a metadata block would be indistinguishable from a clean tree",
    );
  });
});

test("an invalid range is a real error, not an empty-clean result", () => {
  withRepo((dir) => {
    const result = gatherWith(dir, ["--range", "no-such-ref..also-missing"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /invalid git range/);
    assert.ok(!result.stdout.includes("=== METADATA ==="));
  });
});

test("conflicting or malformed target flags are rejected", () => {
  withRepo((dir) => {
    for (const args of [
      ["--uncommitted", "--range", "HEAD~1..HEAD"],
      ["--range", "HEAD~1..HEAD", "--path", "src"],
    ]) {
      const result = gatherWith(dir, args);
      assert.equal(
        result.status,
        2,
        `expected rejection for ${args.join(" ")}`,
      );
      assert.match(result.stderr, /conflicting target flags/);
    }
    for (const args of [["--bogus"], ["--range"], ["--path"]]) {
      const result = gatherWith(dir, args);
      assert.equal(
        result.status,
        2,
        `expected rejection for ${args.join(" ")}`,
      );
      assert.match(result.stderr, /ERROR/);
    }
  });
});

test(
  "an unreadable file is reported as uncovered, not as reviewed",
  { skip: process.getuid?.() === 0 ? "root can read anything" : false },
  () => {
    withRepo((dir) => {
      const blocked = path.join(dir, "blocked.txt");
      fs.writeFileSync(blocked, "DUMMY_MARKER_content\n");
      fs.chmodSync(blocked, 0o000);
      try {
        const result = gather(dir);
        assert.equal(
          result.status,
          3,
          "a read failure must surface as an error",
        );
        const meta = assertMetadataContract(result);
        assert.equal(meta.has_untracked, "true", "the file must not vanish");
        assert.equal(meta.scope_complete, "false");
        assert.ok(
          result.stdout.includes(
            "=== Excluded from review scope (NOT reviewed) ===",
          ) && result.stdout.includes("--- excluded (unreadable): blocked.txt"),
          "the coverage gap must be listed explicitly",
        );
        assert.ok(
          !result.stdout.includes("DUMMY_MARKER_content"),
          "unreadable content must not leak",
        );
      } finally {
        fs.chmodSync(blocked, 0o644);
      }
    });
  },
);

test("unborn branch: staged and untracked still counted, exit 0", () => {
  withRepo(
    (dir) => {
      fs.writeFileSync(path.join(dir, "staged.txt"), "UNBORN_STAGED\n");
      git(dir, ["add", "staged.txt"]);
      fs.writeFileSync(path.join(dir, "loose.txt"), "UNBORN_UNTRACKED\n");

      const result = gather(dir);
      assert.equal(
        result.status,
        0,
        `no-HEAD run must exit 0: ${result.stderr}`,
      );
      const meta = assertMetadataContract(result);
      assert.equal(meta.has_uncommitted, "true");
      assert.equal(meta.has_staged, "true");
      assert.equal(meta.has_untracked, "true");
      assert.equal(meta.head_sha, "");
      assert.ok(result.stdout.includes("UNBORN_STAGED"));
      assert.ok(result.stdout.includes("UNBORN_UNTRACKED"));
    },
    { commit: false },
  );
});

test("privacy-filtered paths are excluded before their content is read", () => {
  withRepo((dir) => {
    const dotEnv = ["", "env"].join(".");
    fs.writeFileSync(path.join(dir, dotEnv), "DUMMY_SECRET_VALUE=1\n");
    fs.writeFileSync(
      path.join(dir, `${dotEnv}.example`),
      "DUMMY_SAFE_VALUE=1\n",
    );

    const result = gather(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes(`--- excluded (sensitive): ${dotEnv}`),
      "sensitive path must be listed as an exclusion",
    );
    assert.ok(
      !result.stdout.includes("DUMMY_SECRET_VALUE"),
      "sensitive content must never be read",
    );
    assert.ok(
      result.stdout.includes("DUMMY_SAFE_VALUE"),
      "the privacy allowlist must still let the example template through",
    );
  });
});

// ── Task 1.3: assessment reads the same capture, no second git diff ─────────

/** Write `count` untracked files of `linesPerFile` lines each. */
function seedUntracked(dir, count, linesPerFile = 1, prefix = "mod") {
  for (let i = 0; i < count; i += 1) {
    const body = Array.from(
      { length: linesPerFile },
      (_, n) => `content ${i}-${n}`,
    ).join("\n");
    fs.writeFileSync(path.join(dir, `${prefix}${i}.txt`), `${body}\n`);
  }
}

/** Create a snapshot with gather-diff.sh and hand the dir to `fn`. */
function withSnapshot(dir, args, fn) {
  const snapshotDir = path.join(dir, "..", `cf-snap-assess-${process.pid}`);
  try {
    const gathered = gatherWith(dir, [...args, "--snapshot-dir", snapshotDir]);
    return fn(snapshotDir, gathered);
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
  }
}

test("file-count thresholds: 3 QUICK, 4 STANDARD, 10 STANDARD, 11 DEEP", () => {
  for (const [count, expected] of [
    [3, "QUICK"],
    [4, "STANDARD"],
    [10, "STANDARD"],
    [11, "DEEP"],
  ]) {
    withRepo((dir) => {
      seedUntracked(dir, count);
      const metrics = assess(dir);
      assert.equal(metrics.status, 0, metrics.stderr);
      const parsed = parseAssess(metrics.stdout);
      assert.equal(
        parsed.FILES_CHANGED,
        String(count),
        `${count} files must be counted exactly once`,
      );
      assert.equal(parsed.MODE, expected, `${count} files -> ${expected}`);
    });
  }
});

test("line-count thresholds: 50 QUICK, 51 STANDARD, 300 STANDARD, 301 DEEP", () => {
  for (const [lines, expected] of [
    [50, "QUICK"],
    [51, "STANDARD"],
    [300, "STANDARD"],
    [301, "DEEP"],
  ]) {
    withRepo((dir) => {
      seedUntracked(dir, 1, lines);
      const metrics = assess(dir);
      assert.equal(metrics.status, 0, metrics.stderr);
      const parsed = parseAssess(metrics.stdout);
      assert.equal(parsed.LINES_CHANGED, String(lines));
      assert.equal(parsed.MODE, expected, `${lines} lines -> ${expected}`);
    });
  }
});

test("a sensitive path forces DEEP even when tiny", () => {
  withRepo((dir) => {
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(
      path.join(dir, "src/authService.ts"),
      "export const a=1;\n",
    );

    const parsed = parseAssess(assess(dir).stdout);
    assert.equal(parsed.FILES_CHANGED, "1");
    assert.equal(parsed.SENSITIVE, "1");
    assert.equal(parsed.MODE, "DEEP");
  });
});

test("explicit --deep and --quick override the detected depth", () => {
  withRepo((dir) => {
    seedUntracked(dir, 1);

    const deep = assessWith(dir, ["--deep"]);
    assert.equal(deep.status, 0, deep.stderr);
    assert.equal(parseAssess(deep.stdout).MODE_AUTO, "QUICK");
    assert.equal(parseAssess(deep.stdout).MODE, "DEEP");

    seedUntracked(dir, 12, 40, "big");
    const quick = assessWith(dir, ["--quick"]);
    assert.equal(quick.status, 0, quick.stderr);
    assert.equal(parseAssess(quick.stdout).MODE_AUTO, "DEEP");
    assert.equal(parseAssess(quick.stdout).MODE, "QUICK");
    assert.equal(parseAssess(quick.stdout).MODE_FORCED, "quick");
  });
});

test("--quick on a sensitive change warns that depth was reduced", () => {
  withRepo((dir) => {
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src/login.ts"), "export const a=1;\n");

    const metrics = assessWith(dir, ["--quick"]);
    assert.equal(metrics.status, 0, metrics.stderr);
    assert.equal(parseAssess(metrics.stdout).MODE, "QUICK");
    assert.match(
      metrics.stderr,
      /reduced depth/,
      "reducing depth on sensitive paths must never be silent",
    );
  });
});

test("a binary file counts as a file without an invented line count", () => {
  withRepo((dir) => {
    fs.writeFileSync(
      path.join(dir, "blob.bin"),
      Buffer.from([0, 1, 2, 3, 0, 255, 254, 0, 7]),
    );
    fs.writeFileSync(
      path.join(dir, "text.txt"),
      `${Array.from({ length: 5 }, (_, i) => `l${i}`).join("\n")}\n`,
    );

    const parsed = parseAssess(assess(dir).stdout);
    assert.equal(parsed.FILES_CHANGED, "2");
    assert.equal(
      parsed.LINES_CHANGED,
      "5",
      "the binary file must contribute no fabricated lines",
    );
  });
});

test("Unicode and space-containing paths are counted, not split", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "with space.txt"), "spaced\n");
    fs.writeFileSync(path.join(dir, "café-ünïcode.txt"), "unicode\n");

    const metrics = assess(dir);
    assert.equal(metrics.status, 0, metrics.stderr);
    const parsed = parseAssess(metrics.stdout);
    assert.equal(
      parsed.FILES_CHANGED,
      "2",
      "a path with a space must stay one file",
    );
    assert.equal(parsed.LINES_CHANGED, "2");
    assert.ok(parsed.CHANGED_FILES.includes("with space.txt"));
    assert.ok(parsed.CHANGED_FILES.includes("café-ünïcode.txt"));
  });
});

test("a renamed file is assessed as its delete + add pair", () => {
  withRepo((dir) => {
    fs.writeFileSync(
      path.join(dir, "original.txt"),
      `${Array.from({ length: 30 }, (_, i) => `content ${i}`).join("\n")}\n`,
    );
    git(dir, ["add", "original.txt"]);
    git(dir, ["commit", "-q", "-m", "chore: add original"]);
    git(dir, ["mv", "original.txt", "renamed.txt"]);

    const metrics = assess(dir);
    assert.equal(metrics.status, 0, metrics.stderr);
    const parsed = parseAssess(metrics.stdout);
    assert.equal(parsed.FILES_CHANGED, "2");
    assert.equal(parsed.LINES_CHANGED, "60");
    assert.ok(parsed.CHANGED_FILES.includes("renamed.txt"));
    assert.ok(parsed.CHANGED_FILES.includes("original.txt"));
  });
});

test("a file changed in two origins is counted once", () => {
  withRepo((dir) => {
    git(dir, ["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "base.txt"), "base\ncommitted line\n");
    git(dir, ["add", "base.txt"]);
    git(dir, ["commit", "-q", "-m", "feat: touch base"]);
    fs.writeFileSync(path.join(dir, "base.txt"), "base\ncommitted line\nwip\n");

    const parsed = parseAssess(assess(dir).stdout);
    assert.equal(
      parsed.FILES_CHANGED,
      "1",
      "committed + uncommitted edits of one path are one file",
    );
    assert.equal(parsed.CHANGED_FILES.trim(), "base.txt");
  });
});

test("--snapshot-dir assessment agrees with the gathered file list", () => {
  withRepo((dir) => {
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "base.txt"), "base\nedited\n");
    fs.writeFileSync(path.join(dir, "src/new file.txt"), "brand new\n");
    fs.writeFileSync(path.join(dir, "café.txt"), "unicode\n");

    withSnapshot(dir, [], (snapshotDir, gathered) => {
      assert.equal(gathered.status, 0, gathered.stderr);
      const snapshotPaths = [
        ...new Set(
          fs
            .readFileSync(path.join(snapshotDir, "files.z"), "utf8")
            .split("\0")
            .filter(Boolean)
            .map((r) => r.split(" ").slice(3).join(" ")),
        ),
      ];

      const metrics = assessWith(dir, ["--snapshot-dir", snapshotDir]);
      assert.equal(metrics.status, 0, metrics.stderr);
      const parsed = parseAssess(metrics.stdout);
      assert.equal(parsed.FILES_CHANGED, String(snapshotPaths.length));
      for (const p of snapshotPaths) {
        assert.ok(
          parsed.CHANGED_FILES.includes(p),
          `assessment dropped ${p} from the gathered scope`,
        );
      }
    });
  });
});

test("--snapshot-dir assessment runs no live git command", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "base.txt"), "base\nSNAPSHOT_ONLY\n");

    withSnapshot(dir, [], (snapshotDir, gathered) => {
      assert.equal(gathered.status, 0, gathered.stderr);
      const before = parseAssess(
        assessWith(dir, ["--snapshot-dir", snapshotDir]).stdout,
      );

      // Move the working tree on: a snapshot read must not notice.
      seedUntracked(dir, 12, 60, "after");
      const after = assessWith(dir, ["--snapshot-dir", snapshotDir]);
      assert.equal(after.status, 0, after.stderr);
      const parsed = parseAssess(after.stdout);
      assert.equal(parsed.FILES_CHANGED, before.FILES_CHANGED);
      assert.equal(parsed.LINES_CHANGED, before.LINES_CHANGED);
      assert.equal(parsed.MODE, before.MODE);
    });
  });
});

test("an invalid, missing or version-mismatched snapshot fails closed", () => {
  withRepo((dir) => {
    seedUntracked(dir, 2);

    const missing = assessWith(dir, [
      "--snapshot-dir",
      path.join(dir, "no-such-snapshot"),
    ]);
    assert.equal(missing.status, 2, "a missing snapshot must not default");
    assert.match(missing.stderr, /ERROR/);
    assert.ok(
      !missing.stdout.includes("MODE="),
      "no MODE may be emitted for an unusable snapshot",
    );

    withSnapshot(dir, [], (snapshotDir, gathered) => {
      assert.equal(gathered.status, 0, gathered.stderr);
      const metaPath = path.join(snapshotDir, "metadata.txt");
      const original = fs.readFileSync(metaPath, "utf8");

      fs.writeFileSync(
        metaPath,
        original.replace("scope_version=1", "scope_version=2"),
      );
      const mismatched = assessWith(dir, ["--snapshot-dir", snapshotDir]);
      assert.equal(mismatched.status, 2, "a version mismatch must fail closed");
      assert.match(mismatched.stderr, /scope snapshot version/);
      assert.ok(!mismatched.stdout.includes("MODE="));

      fs.writeFileSync(metaPath, original);
      fs.writeFileSync(path.join(snapshotDir, "files.z"), "");
      const truncated = assessWith(dir, ["--snapshot-dir", snapshotDir]);
      assert.equal(truncated.status, 2, "a truncated index must fail closed");
      assert.match(truncated.stderr, /truncated/);
      assert.ok(!truncated.stdout.includes("MODE="));
    });
  });
});

test("--snapshot-dir cannot be mixed with live target flags", () => {
  withRepo((dir) => {
    withSnapshot(dir, [], (snapshotDir) => {
      const result = assessWith(dir, [
        "--snapshot-dir",
        snapshotDir,
        "--uncommitted",
      ]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /ERROR/);
      assert.ok(!result.stdout.includes("MODE="));
    });
  });
});

test("bad assess flags are rejected instead of defaulting to QUICK", () => {
  withRepo((dir) => {
    for (const args of [["--bogus"], ["--range"], ["--snapshot-dir"]]) {
      const result = assessWith(dir, args);
      assert.equal(
        result.status,
        2,
        `expected rejection for ${args.join(" ")}`,
      );
      assert.match(result.stderr, /ERROR/);
      assert.ok(!result.stdout.includes("MODE="));
    }
  });
});

test("a zero-line diff produces a clean QUICK with no stderr noise", () => {
  withRepo((dir) => {
    const metrics = assess(dir);
    assert.equal(metrics.status, 0, metrics.stderr);
    assert.equal(
      metrics.stderr,
      "",
      `assessment of an unchanged tree must be silent: ${metrics.stderr}`,
    );
    const parsed = parseAssess(metrics.stdout);
    assert.equal(parsed.FILES_CHANGED, "0");
    assert.equal(parsed.LINES_CHANGED, "0");
    assert.equal(parsed.MODE, "QUICK");
  });
});

test("--range assessment measures only the range", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "first.txt"), "one\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "chore: first"]);
    fs.writeFileSync(path.join(dir, "second.txt"), "two\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "chore: second"]);
    seedUntracked(dir, 12, 60, "noise");

    const metrics = assessWith(dir, ["--range", "HEAD~1..HEAD"]);
    assert.equal(metrics.status, 0, metrics.stderr);
    const parsed = parseAssess(metrics.stdout);
    assert.equal(parsed.FILES_CHANGED, "1");
    assert.equal(parsed.CHANGED_FILES.trim(), "second.txt");
    assert.equal(parsed.MODE, "QUICK");
  });
});

// Privacy/ignore filtering is a security control. When its pattern library
// cannot be loaded, the scope must NOT come back silently "clean" with
// sensitive file contents inlined — it has to warn and mark the scope
// incomplete, the same way an unreadable file does.
test("missing filter library fails loudly instead of failing open", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-scope-nolib-"));
  try {
    const scripts = path.join(tmp, "scripts");
    fs.mkdirSync(scripts, { recursive: true });
    for (const f of ["review-scope.sh", "gather-diff.sh"]) {
      fs.copyFileSync(
        path.join(repoRoot, "plugin/skills/cf-review/scripts", f),
        path.join(scripts, f),
      );
    }
    const repo = path.join(tmp, "repo");
    fs.mkdirSync(repo, { recursive: true });
    git(repo, ["init", "-q", "."]);
    git(repo, ["config", "user.email", "t@example.invalid"]);
    git(repo, ["config", "user.name", "t"]);
    fs.writeFileSync(path.join(repo, "ok.txt"), "x\n");
    git(repo, ["add", "ok.txt"]);
    git(repo, ["commit", "-qm", "init"]);
    fs.writeFileSync(path.join(repo, "secret.txt"), "DUMMY_VALUE_1\n");

    const res = runScript(path.join(scripts, "gather-diff.sh"), repo);
    assert.match(
      res.stderr,
      /privacy pattern library/i,
      "must warn that the filter library is unavailable",
    );
    assert.match(
      res.stdout,
      /^scope_complete=false$/m,
      "an unfiltered scope must not be reported as complete",
    );
    assert.equal(res.status, 3, "incomplete scope exits 3");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/* ---------------------------------------------------------------------------
 * Exporter cap / subset coverage (plan task 4.1)
 *
 * build-review-prompt.sh embeds at most MAX_DIFF_LINES of diff. Whoever reads
 * that prompt then reviewed a SUBSET of the target. The prose note alone is not
 * enough: the subset state has to be machine-readable so `--out` collection and
 * the external runner can carry it as uncovered scope instead of full coverage.
 * ------------------------------------------------------------------------ */

const MAX_DIFF_LINES = 5000;

/** Pipe gather-diff output (or any raw diff+metadata) into the exporter. */
function buildPrompt(dir, input, label = "2026-09-16-review") {
  return spawnSync("bash", [buildPromptScript, label, "docs"], {
    cwd: dir,
    env: gitEnv,
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Parse the `key: value` lines of the prompt's leading frontmatter block. */
function promptFrontmatter(stdout) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(stdout);
  assert.ok(match, "the review prompt must open with a frontmatter block");
  const out = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

/** The diff body the external reviewer actually receives. */
function embeddedDiff(stdout) {
  const match = /<diff>\n([\s\S]*)\n<\/diff>/.exec(stdout);
  assert.ok(match, "the review prompt must embed the diff in a <diff> block");
  return match[1];
}

test("a diff over the exporter cap is exported as an explicit subset", () => {
  withRepo((dir) => {
    const body = Array.from(
      { length: MAX_DIFF_LINES + 500 },
      (_, i) => `line ${i}`,
    ).join("\n");
    fs.writeFileSync(path.join(dir, "big.txt"), `${body}\n`);

    const gathered = gather(dir);
    assert.equal(gathered.status, 0, gathered.stderr);
    const total = gathered.stdout
      .replace(/^=== METADATA ===[\s\S]*?=== END METADATA ===\n?/m, "")
      .replace(/^\n/, "")
      .split("\n").length;
    assert.ok(
      total > MAX_DIFF_LINES,
      `fixture must exceed the cap, got ${total} lines`,
    );

    const prompt = buildPrompt(dir, gathered.stdout);
    assert.equal(prompt.status, 0, prompt.stderr);

    // 1. the human-readable note survives
    assert.match(prompt.stdout, /Review covers a subset/);

    // 2. the reviewer only ever sees the capped body
    assert.equal(
      embeddedDiff(prompt.stdout).split("\n").length,
      MAX_DIFF_LINES,
      "the embedded diff must stop at the cap",
    );

    // 3. the subset state is machine-readable for /cf-review-in and the runner
    const meta = promptFrontmatter(prompt.stdout);
    assert.equal(meta.diff_truncated, "true");
    assert.equal(Number(meta.diff_lines_included), MAX_DIFF_LINES);
    assert.ok(
      Number(meta.diff_lines_total) > MAX_DIFF_LINES,
      "diff_lines_total must describe the whole target, not the subset",
    );

    // 4. a caller that only reads stderr still learns coverage was partial
    assert.match(prompt.stderr, /^CF_PROMPT_SCOPE=subset\b/m);
  });
});

test("a diff under the exporter cap is exported as complete coverage", () => {
  withRepo((dir) => {
    fs.writeFileSync(path.join(dir, "small.txt"), "PROMPT_MARK\n");

    const gathered = gather(dir);
    assert.equal(gathered.status, 0, gathered.stderr);
    const prompt = buildPrompt(dir, gathered.stdout);
    assert.equal(prompt.status, 0, prompt.stderr);

    assert.doesNotMatch(prompt.stdout, /Review covers a subset/);
    const meta = promptFrontmatter(prompt.stdout);
    assert.equal(meta.diff_truncated, "false");
    assert.equal(meta.diff_lines_included, meta.diff_lines_total);
    assert.doesNotMatch(
      prompt.stderr,
      /CF_PROMPT_SCOPE/,
      "a complete export must not raise a subset signal",
    );
    assert.ok(prompt.stdout.includes("PROMPT_MARK"));
  });
});

test("the exporter counts the whole target, not just the embedded subset", () => {
  withRepo((dir) => {
    const body = Array.from(
      { length: MAX_DIFF_LINES + 500 },
      (_, i) => `line ${i}`,
    ).join("\n");
    // A TRACKED edit, so every added line shows up as a `+` line the exporter
    // counts — an untracked file is embedded as plain content and counts zero.
    fs.writeFileSync(path.join(dir, "base.txt"), `base\n${body}\n`);

    const gathered = gather(dir);
    const prompt = buildPrompt(dir, gathered.stdout);
    assert.equal(prompt.status, 0, prompt.stderr);

    const linesChanged = /\*\*Lines changed:\*\* ~(\d+)/.exec(prompt.stdout);
    assert.ok(linesChanged, "the prompt header must report a line count");
    assert.ok(
      Number(linesChanged[1]) > MAX_DIFF_LINES,
      `header must describe the full target, got ${linesChanged[1]}`,
    );
  });
});
