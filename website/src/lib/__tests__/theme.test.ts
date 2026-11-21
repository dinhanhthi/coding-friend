import assert from "node:assert/strict";
import { test } from "node:test";
import {
  THEME_KEY,
  diagramDarkSrc,
  nextTheme,
  resolveInitialTheme,
  themeInitScript,
} from "../theme";

test("a valid saved theme wins", () => {
  assert.equal(resolveInitialTheme("light"), "light");
  assert.equal(resolveInitialTheme("dark"), "dark");
});

test("the site is dark until the visitor picks light, whatever the system says", () => {
  assert.equal(resolveInitialTheme(null), "dark");
  assert.equal(resolveInitialTheme("purple"), "dark");
  assert.equal(resolveInitialTheme(""), "dark");
});

test("nextTheme toggles between light and dark", () => {
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "light");
});

test("diagramDarkSrc maps a local diagram SVG to its -dark twin", () => {
  assert.equal(
    diagramDarkSrc("/diagrams/architecture.svg"),
    "/diagrams/architecture-dark.svg",
  );
});

test("diagramDarkSrc returns null for anything that has no dark twin", () => {
  for (const src of [
    "/cf-host.png",
    "/statusline.png",
    "https://example.com/diagrams/foo.svg",
    "http://example.com/diagrams/foo.svg",
    "/diagrams/foo.png",
    "/diagrams/foo-dark.svg",
    "/other/foo.svg",
  ]) {
    assert.equal(diagramDarkSrc(src), null, src);
  }
});

/** Run the init script against a fake browser and return the theme it set. */
function runInitScript(saved: string | null, prefersDark: boolean): unknown {
  const root: { dataset: { theme?: string } } = { dataset: {} };
  const run = new Function(
    "localStorage",
    "matchMedia",
    "document",
    themeInitScript,
  );
  run(
    { getItem: (key: string) => (key === THEME_KEY ? saved : null) },
    () => ({ matches: prefersDark }),
    { documentElement: root },
  );
  return root.dataset.theme;
}

test("themeInitScript is valid JS that reads the theme key", () => {
  assert.ok(themeInitScript.includes(JSON.stringify(THEME_KEY)));
  assert.doesNotThrow(() => new Function(themeInitScript));
});

test("themeInitScript applies the same rules as resolveInitialTheme", () => {
  assert.equal(runInitScript("light", true), "light");
  assert.equal(runInitScript("dark", false), "dark");
  assert.equal(runInitScript(null, true), "dark");
  assert.equal(runInitScript(null, false), "dark");
  assert.equal(runInitScript("purple", false), "dark");
});

test("themeInitScript swallows storage errors", () => {
  const run = new Function(
    "localStorage",
    "matchMedia",
    "document",
    themeInitScript,
  );
  assert.doesNotThrow(() =>
    run(
      {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      () => ({ matches: false }),
      { documentElement: { dataset: {} } },
    ),
  );
});
