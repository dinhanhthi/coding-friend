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
const skillDir = path.join(repoRoot, "plugin/skills/cf-showcase");
const templatesDir = path.join(skillDir, "templates");
const scriptsDir = path.join(skillDir, "scripts");

const requiredFiles = [
  "SKILL.md",
  "modes/video.md",
  "templates/video.html",
  "templates/capture.mjs",
  "templates/inline-assets.mjs",
  "templates/audio.py",
  "templates/source-package.json",
  "templates/source-gitignore",
  "templates/source-README.md",
  "scripts/check-deps.sh",
  "scripts/verify-video.sh",
];

// Throws when dir is missing, so tests fail loudly instead of passing vacuously.
function walk(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assertRuns(cmd, args, file) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `${cmd} failed on ${path.relative(repoRoot, file)}: ${result.stderr}`,
  );
}

test("cf-showcase ships every required file", () => {
  for (const rel of requiredFiles) {
    assert.ok(
      fs.existsSync(path.join(skillDir, rel)),
      `missing plugin/skills/cf-showcase/${rel}`,
    );
  }
});

test("every template .mjs passes node --check", () => {
  const files = walk(templatesDir).filter((f) => f.endsWith(".mjs"));
  assert.ok(files.length > 0, "no .mjs templates found");
  for (const file of files) {
    assertRuns(process.execPath, ["--check", file], file);
  }
});

test("every script .sh passes bash -n", () => {
  const files = walk(scriptsDir).filter((f) => f.endsWith(".sh"));
  assert.ok(files.length > 0, "no .sh scripts found");
  for (const file of files) {
    assertRuns("bash", ["-n", file], file);
  }
});

test("templates/audio.py compiles with python3", (t) => {
  const probe = spawnSync("python3", ["--version"]);
  if (probe.error || probe.status !== 0) {
    t.skip("python3 not found");
    return;
  }
  const file = path.join(templatesDir, "audio.py");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-showcase-"));
  try {
    assertRuns(
      "python3",
      [
        "-c",
        "import py_compile,sys; py_compile.compile(sys.argv[1], cfile=sys.argv[2], doraise=True)",
        file,
        path.join(tmp, "audio.pyc"),
      ],
      file,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("templates and scripts contain no host-rewritten tokens", () => {
  const forbidden = ["{{cf:", "CLAUDE", "(sonnet)", "Agent tool"];
  for (const file of [...walk(templatesDir), ...walk(scriptsDir)]) {
    const text = read(file);
    for (const token of forbidden) {
      assert.ok(
        !text.includes(token),
        `${path.relative(repoRoot, file)} contains ${token}`,
      );
    }
  }
});

test("video.html and scenes are deterministic", () => {
  const files = [path.join(templatesDir, "video.html")];
  const scenesDir = path.join(templatesDir, "scenes");
  if (fs.existsSync(scenesDir)) {
    files.push(...walk(scenesDir).filter((f) => f.endsWith(".js")));
  }
  for (const file of files) {
    const text = read(file);
    for (const token of ["Date.now", "performance.now", "Math.random"]) {
      assert.ok(
        !text.includes(token),
        `${path.relative(repoRoot, file)} uses ${token}`,
      );
    }
  }
});

test("source-package.json depends on puppeteer-core", () => {
  const pkg = JSON.parse(read(path.join(templatesDir, "source-package.json")));
  assert.ok(
    pkg.dependencies?.["puppeteer-core"],
    "source-package.json is missing dependencies.puppeteer-core",
  );
});

test("capture.mjs supports every mode, --aspect and CHROME_PATH", () => {
  const text = read(path.join(templatesDir, "capture.mjs"));
  for (const mode of ["video", "sheet", "poster", "timeline"]) {
    assert.match(
      text,
      new RegExp(`["'\`]${mode}["'\`]`),
      `capture.mjs does not mention mode "${mode}"`,
    );
  }
  for (const token of ["--aspect", "CHROME_PATH"]) {
    assert.ok(text.includes(token), `capture.mjs does not mention ${token}`);
  }
});

test("inline-assets.mjs rejects refs outside --root and keeps in-root ../ refs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-showcase-inline-"));
  try {
    const root = path.join(tmp, "root");
    const sub = path.join(root, "sub");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(root, "ok.png"), Buffer.from([0x89, 0x50]));
    fs.writeFileSync(path.join(tmp, "outside.txt"), "secret");
    const script = path.join(templatesDir, "inline-assets.mjs");
    const run = (html) => {
      const src = path.join(sub, "page.html");
      fs.writeFileSync(src, html);
      const out = path.join(tmp, "out.html");
      fs.rmSync(out, { force: true });
      const result = spawnSync(
        process.execPath,
        [script, "--src", src, "--out", out, "--root", root],
        { encoding: "utf8" },
      );
      return { result, out };
    };

    const bad = run('<img src="../ok.png"><img src="../../outside.txt">');
    assert.notEqual(bad.result.status, 0, "outside ref must be rejected");

    const good = run('<img src="../ok.png">');
    assert.equal(good.result.status, 0, good.result.stderr);
    assert.match(read(good.out), /data:image\/png;base64/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("verify-video.sh fails on long black tail and allows a short black start", (t) => {
  for (const tool of ["ffmpeg", "ffprobe"]) {
    const probe = spawnSync(tool, ["-version"]);
    if (probe.error || probe.status !== 0) {
      t.skip(`${tool} not found`);
      return;
    }
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-showcase-verify-"));
  const script = path.join(scriptsDir, "verify-video.sh");
  const make = (name, first, firstDur, second, secondDur) => {
    const file = path.join(tmp, name);
    const src = (c, d) => `color=c=${c}:s=320x180:r=60:d=${d}`;
    const result = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        src(first, firstDur),
        "-f",
        "lavfi",
        "-i",
        src(second, secondDur),
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0[v]",
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        file,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return file;
  };
  const verify = (file) =>
    spawnSync("bash", [script, file, "--fps", "60", "--size", "320x180"], {
      encoding: "utf8",
    });
  try {
    const tail = verify(make("tail.mp4", "white", 1, "black", 3));
    assert.equal(tail.status, 1, tail.stdout + tail.stderr);

    const start = verify(make("start.mp4", "black", 0.3, "blue", 3.7));
    assert.equal(start.status, 0, start.stdout + start.stderr);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
