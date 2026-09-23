// one-shot: reads the original Night Foundry colors; running it again finds nothing to replace
// Writes public/diagrams/foo-dark.svg (Coral zinc dark) and overwrites foo.svg (Coral zinc light).
// Exits non-zero if a source file has none of the source colors (already converted).
import fs from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "public", "diagrams");
const names = [
  "architecture",
  "workflow",
  "review-external",
  "memory-tiers",
  "auto-approve",
  "security-pipeline",
];

// Order matters: the alpha stroke contains the text color as a prefix.
const map = [
  ["96% 0.006 262 / 0.18", "84% 0.01 264", "36% 0.01 264"], // stroke → rule-strong
  ["17% 0.016 265", "99% 0.003 264", "15% 0.005 264"], // bg → paper
  ["22% 0.016 265", "97% 0.004 264", "19% 0.006 264"], // node → paper-2
  ["96% 0.006 262", "20% 0.012 264", "96% 0.004 264"], // text → ink
  ["67% 0.012 262", "48% 0.012 264", "70% 0.01 264"], // muted
  ["76% 0.17 50", "20% 0.012 264", "96% 0.004 264"], // brass → ink
  ["68% 0.16 18", "48% 0.14 264", "72% 0.14 264"], // coral → focus
];

function recolor(svg, col, theme) {
  let out = svg;
  for (const row of map) {
    out = out.replaceAll(`oklch(${row[0]})`, `oklch(${row[col]})`);
  }
  return out.replace(
    /data-visual-theme="[^"]*"/,
    `data-visual-theme="Coral zinc ${theme}"`,
  );
}

for (const name of names) {
  const file = path.join(dir, `${name}.svg`);
  const svg = fs.readFileSync(file, "utf8");
  if (!map.some(([src]) => svg.includes(`oklch(${src})`))) {
    console.error(
      `${name}.svg: no Night Foundry colors found (already converted?)`,
    );
    process.exit(1);
  }
  fs.writeFileSync(path.join(dir, `${name}-dark.svg`), recolor(svg, 2, "dark"));
  fs.writeFileSync(file, recolor(svg, 1, "light"));
  console.log(`${name}: light + dark written`);
}
