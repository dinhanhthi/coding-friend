import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import vm from "node:vm";

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
  "templates/strings.example.js",
  "modes/poster.md",
  "templates/poster.html",
];

// Scene key = filename: scenes/demo-window.js registers SCENES["demo-window"],
// the same name a TIMELINE entry uses in `scene:`.
const sceneNames = [
  "hook",
  "reveal",
  "demo-window",
  "demo-terminal",
  "feature-grid",
  "orbit",
  "counter-wall",
  "end-card",
];
requiredFiles.push(...sceneNames.map((n) => `templates/scenes/${n}.js`));

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

test("every template .js passes node --check", () => {
  const files = walk(templatesDir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= sceneNames.length + 1, "missing .js templates");
  for (const file of files) {
    assertRuns(process.execPath, ["--check", file], file);
  }
});

test("each scene registers SCENES[<filename>]", () => {
  for (const name of sceneNames) {
    const text = read(path.join(templatesDir, "scenes", `${name}.js`));
    assert.match(
      text,
      new RegExp(`SCENES\\[["']${name}["']\\]\\s*=`),
      `scenes/${name}.js does not register SCENES["${name}"]`,
    );
  }
});

test("strings.example.js has the same keys in en and vi", () => {
  const window = {};
  vm.runInNewContext(read(path.join(templatesDir, "strings.example.js")), {
    window,
  });
  const preset = window.STR_PRESET;
  assert.ok(preset?.en && preset?.vi, "STR_PRESET.en / .vi missing");
  const keys = (o, p = "") =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? keys(v, `${p}${k}.`)
        : [`${p}${k}`],
    );
  assert.deepEqual(keys(preset.vi).sort(), keys(preset.en).sort());
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
  const scenes = walk(path.join(templatesDir, "scenes")).filter((f) =>
    f.endsWith(".js"),
  );
  assert.ok(scenes.length >= sceneNames.length, "scene files missing");
  const files = [
    path.join(templatesDir, "video.html"),
    path.join(templatesDir, "strings.example.js"),
    ...scenes,
  ];
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

test("video.html wires strings.example.js and every scene", () => {
  const html = read(path.join(templatesDir, "video.html"));
  assert.match(html, /<script src="strings\.example\.js"><\/script>/);
  for (const name of sceneNames) {
    assert.ok(
      html.includes(`<script src="scenes/${name}.js"></script>`),
      `video.html does not load scenes/${name}.js`,
    );
  }
  assert.ok(!html.includes("SCENES.title"), "placeholder SCENES.title left");
  const timeline = /const TIMELINE = \[([\s\S]*?)\n\s*\];/.exec(html);
  assert.ok(timeline, "TIMELINE literal not found");
  const used = [...timeline[1].matchAll(/scene:\s*["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
  assert.ok(used.length >= 7, `TIMELINE has only ${used.length} scenes`);
  for (const name of used) {
    assert.ok(sceneNames.includes(name), `TIMELINE uses unknown scene ${name}`);
  }
});

test("modes/video.md has a Scene catalog row for every scene", () => {
  const md = read(path.join(skillDir, "modes/video.md"));
  const at = md.indexOf("## Scene catalog");
  assert.ok(at >= 0, "no Scene catalog section");
  const section = md.slice(at).split(/\n## /)[0];
  for (const name of sceneNames) {
    assert.match(
      section,
      new RegExp(`^\\|\\s*\`${name}\`\\s*\\|`, "m"),
      `Scene catalog has no row for ${name}`,
    );
  }
});

test("poster.html is DOM-only, deterministic, with three layouts", () => {
  const html = read(path.join(templatesDir, "poster.html"));
  assert.ok(html.includes("data-layout"), "poster.html has no data-layout");
  for (const layout of ["hero", "grid", "editorial"]) {
    assert.ok(html.includes(layout), `poster.html has no ${layout} layout`);
  }
  assert.ok(!html.includes("<canvas"), "poster.html must not use <canvas>");
  for (const token of [
    "Date.now",
    "performance.now",
    "Math.random",
    "innerHTML",
  ]) {
    assert.ok(!html.includes(token), `poster.html uses ${token}`);
  }
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, "poster.html has no inline script");
  for (const [, code] of scripts) new vm.Script(code); // throws on a syntax error
});

test("modes/poster.md covers the interview and the capture command", () => {
  const md = read(path.join(skillDir, "modes/poster.md"));
  for (const topic of ["style", "color", "size", "language", "emphasize"]) {
    assert.match(
      md,
      new RegExp(topic, "i"),
      `modes/poster.md does not mention ${topic}`,
    );
  }
  for (const format of ["PNG", "PDF", "HTML"]) {
    assert.ok(
      md.includes(format),
      `modes/poster.md does not mention ${format}`,
    );
  }
  assert.match(md, /node capture\.mjs --mode poster/);
});

test("every scene rgba() accepts #RGB/#RRGGBB/#RRGGBBAA and throws on other colors", () => {
  const helpers = sceneNames.map((name) => {
    const text = read(path.join(templatesDir, "scenes", `${name}.js`));
    const m = /function rgba\(hex, a\) \{[\s\S]*?\n {2}\}/.exec(text);
    assert.ok(m, `scenes/${name}.js has no rgba() helper`);
    return m[0];
  });
  for (const h of helpers)
    assert.equal(h, helpers[0], "rgba() helpers drifted");
  const rgba = vm.runInNewContext(`(${helpers[0]})`);
  assert.equal(rgba("#fff", 1), "rgba(255,255,255,1)");
  assert.equal(rgba("#F3F5FA", 0.5), "rgba(243,245,250,0.5)");
  assert.equal(rgba("#ff000080", 1), `rgba(255,0,0,${128 / 255})`);
  for (const bad of ["rgb(1,2,3)", "#ff00", "hsl(0 0% 0%)"])
    assert.throws(() => rgba(bad, 1), new RegExp(bad.replace(/[()]/g, "\\$&")));
});

test("counter-wall keeps decimals and ends on the exact count", () => {
  const SCENES = {};
  vm.runInNewContext(read(path.join(templatesDir, "scenes/counter-wall.js")), {
    SCENES,
  });
  const drawn = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, k) =>
        k === "measureText"
          ? (s) => ({ width: s.length * 10 })
          : k === "createLinearGradient"
            ? () => ({ addColorStop() {} })
            : k === "fillText"
              ? (s) => drawn.push(s)
              : () => {},
      set: () => true,
    },
  );
  const env = {
    W: 1920,
    H: 1080,
    ease: { expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)) },
    spring: () => 1,
    brand: { colors: { bg: "#000000", accent: "#4F7CFF", fg: "#fff" } },
    fonts: { sans: "x" },
    str: {},
  };
  const at = (lt, opts) => {
    drawn.length = 0;
    SCENES["counter-wall"].draw(ctx, lt, opts, env);
    return drawn[0];
  };
  assert.equal(at(2.5, { count: 99.9, suffix: "%" }), "99.9%");
  assert.match(at(1.0, { count: 99.9, suffix: "%" }), /^\d+\.\d$/);
  assert.equal(at(2.5, { count: 12345.5, sep: "," }), "12,345.5");
  assert.equal(at(2.5, { count: 12345, sep: "." }), "12.345");
});

test("sample copy carries the SAMPLE: marker and the docs grep for it", () => {
  const leaves = (o, p = "") =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === "object"
        ? leaves(v, `${p}${k}.`)
        : typeof v === "string"
          ? [[`${p}${k}`, v]]
          : [],
    );
  // Preview chrome (not in the rendered film) and non-copy tokens; demo.select
  // must stay a verbatim substring of demo.body, which carries the marker.
  const skip =
    /^(title|toggle|chapters\.\d+|demo\.select|demo\.chip|terminal\.chip|terminal\.prompt|wall\.sep|wall\.suffix)$/;
  const window = {};
  vm.runInNewContext(read(path.join(templatesDir, "strings.example.js")), {
    window,
  });
  const html = read(path.join(templatesDir, "poster.html"));
  const m = /const STR = (\{[\s\S]*?\n {6}\});/.exec(html);
  assert.ok(m, "poster.html STR literal not found");
  const poster = vm.runInNewContext(`(${m[1]})`);
  for (const [where, table, skipRe] of [
    ["strings.example.js", window.STR_PRESET, skip],
    ["poster.html", poster, /^$/],
  ]) {
    for (const lang of ["en", "vi"]) {
      for (const [key, value] of leaves(table[lang])) {
        if (skipRe.test(key)) continue;
        assert.ok(
          value.startsWith("SAMPLE: "),
          `${where} ${lang}.${key} lacks the SAMPLE: marker: ${value}`,
        );
      }
    }
  }
  const { demo } = window.STR_PRESET.en;
  assert.ok(demo.body.includes(demo.select), "demo.select not in demo.body");
  for (const mode of ["video", "poster"]) {
    const md = read(path.join(skillDir, `modes/${mode}.md`));
    assert.match(
      md,
      /grep[^\n]*SAMPLE:/,
      `modes/${mode}.md has no SAMPLE: grep`,
    );
  }
});

test("no comment spells the SAMPLE: marker", () => {
  // The docs gate on `grep -c 'SAMPLE:'` printing 0 once every string is
  // replaced; inline-assets keeps comments, so they must never spell it.
  const comments = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<![:"'\\])\/\/[^\n]*/g;
  for (const file of ["strings.example.js", "poster.html", "video.html"]) {
    for (const c of read(path.join(templatesDir, file)).match(comments) ?? []) {
      assert.doesNotMatch(
        c,
        /SAMPLE:/,
        `${file} comment spells SAMPLE:: ${c.slice(0, 80)}`,
      );
    }
  }
});

test("demo-window TIMELINE entry has audio events matching its cursor keyframes", () => {
  const html = read(path.join(templatesDir, "video.html"));
  const entry = /\{\s*scene: "demo-window",[\s\S]*?\n {8}\},/.exec(html);
  assert.ok(entry, "demo-window TIMELINE entry with opts not found");
  const events = /events:\s*(\[[\s\S]*?\])\s*,?\s*\}/.exec(entry[0]);
  assert.ok(events, "demo-window entry has no opts.events");
  const list = [...vm.runInNewContext(`(${events[1]})`)];
  const clicks = list.filter((e) => e.kind === "click").map((e) => e.t);
  assert.deepEqual(clicks, [1.1, 2.7, 6.4]);
  assert.ok(list.some((e) => e.kind === "tick" && e.t > 3.1 && e.t < 5.5));
  const md = read(path.join(skillDir, "modes/video.md"));
  assert.match(md, /opts\.events[^\n]*cursor/);
});

test("poster.html falls back to <body data-size> when no ?size= is given", () => {
  const html = read(path.join(templatesDir, "poster.html"));
  assert.match(html, /<body[^>]*\sdata-size="1200x630"/);
  assert.match(html, /Q\.get\("size"\) \|\| document\.body\.dataset\.size/);
  assert.match(read(path.join(skillDir, "modes/poster.md")), /data-size/);
});
