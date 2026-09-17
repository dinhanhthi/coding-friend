import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChangelog, pickRecent } from "../changelog";

const PLUGIN_MD = `# Changelog (Plugin)

> CLI changelog: \`[cli/CHANGELOG.md](../cli/CHANGELOG.md)\`

## v0.43.3 (2026-09-14)

- Auto-approve test runners across languages [#cdd376ca](https://example.com/cdd376ca)

## v0.43.2 (2026-09-10)

- Restrict \`cf-reviewer*\` agent tool allow-lists
- Lint tool allow-lists across agents
- Tighten the \`SENSITIVE\` regex
`;

const CLI_MD = `# Changelog (CLI)

## v1.40.3 (2026-09-09)

- Pressing \`Esc\` in \`cf init\` now goes back a step

## Historical changelogs

- not a version heading, must be ignored
`;

test("parses version, date and bullets from a changelog", () => {
  const entries = parseChangelog(PLUGIN_MD, "plugin");
  assert.equal(entries.length, 2);
  assert.deepEqual(
    { version: entries[0].version, date: entries[0].date },
    { version: "0.43.3", date: "2026-09-14" },
  );
  assert.equal(entries[1].bullets.length, 3);
});

test("builds the release tag href per source", () => {
  assert.match(
    parseChangelog(PLUGIN_MD, "plugin")[0].href,
    /\/releases\/tag\/v0\.43\.3$/,
  );
  assert.match(
    parseChangelog(CLI_MD, "cli")[0].href,
    /\/releases\/tag\/cli-v1\.40\.3$/,
  );
});

test("skips headings that are not version headings", () => {
  const entries = parseChangelog(CLI_MD, "cli");
  assert.deepEqual(
    entries.map((e) => e.version),
    ["1.40.3"],
  );
});

test("merges both sources, sorts by date desc and keeps the newest two", () => {
  const merged = [
    ...parseChangelog(PLUGIN_MD, "plugin"),
    ...parseChangelog(CLI_MD, "cli"),
  ];
  const recent = pickRecent(merged, Date.parse("2026-09-17"));
  assert.deepEqual(
    recent.map((e) => `${e.source} ${e.version}`),
    ["plugin 0.43.3", "plugin 0.43.2"],
  );
});

test("puts the plugin first when both sources released on the same day", () => {
  const sameDay = [
    ...parseChangelog("## v1.40.3 (2026-09-14)\n\n- cli bullet\n", "cli"),
    ...parseChangelog("## v0.43.3 (2026-09-14)\n\n- plugin bullet\n", "plugin"),
  ];
  assert.deepEqual(
    pickRecent(sameDay, Date.parse("2026-09-17")).map((e) => e.source),
    ["plugin", "cli"],
  );
});

test("returns nothing when the newest version is older than a month", () => {
  const merged = parseChangelog(PLUGIN_MD, "plugin");
  assert.deepEqual(pickRecent(merged, Date.parse("2026-11-01")), []);
});

test("keeps a single entry when only one version is within the month", () => {
  const merged = parseChangelog(PLUGIN_MD, "plugin");
  const recent = pickRecent(merged, Date.parse("2026-10-12"));
  assert.deepEqual(
    recent.map((e) => e.version),
    ["0.43.3"],
  );
});
