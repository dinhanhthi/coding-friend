import fs from "fs";
import path from "path";
import type { ChangelogEntry, ChangelogChange } from "./types";

const repoRoot = path.join(process.cwd(), "..");

export function getPluginChangelog(): string {
  return fs.readFileSync(path.join(repoRoot, "plugin/CHANGELOG.md"), "utf-8");
}

export function getCliChangelog(): string {
  return fs.readFileSync(path.join(repoRoot, "cli/CHANGELOG.md"), "utf-8");
}

export function getLearnHostChangelog(): string {
  return fs.readFileSync(
    path.join(repoRoot, "lib/learn-host/CHANGELOG.md"),
    "utf-8",
  );
}

export function getLearnMcpChangelog(): string {
  return fs.readFileSync(
    path.join(repoRoot, "lib/learn-mcp/CHANGELOG.md"),
    "utf-8",
  );
}

function classifyChange(line: string): ChangelogChange {
  const text = line.replace(/^-\s*/, "").trim();

  // Security section items
  if (
    /^(Add|Improve|Fix).*(?:security|injection|defense|isolation)/i.test(text)
  ) {
    return { text: humanize(text), tag: "security" };
  }

  // Remove/Delete
  if (/^Remove\b/i.test(text)) {
    return { text: humanize(text), tag: "removed" };
  }

  // Fix
  if (/^Fix\b/i.test(text)) {
    return { text: humanize(text), tag: "fixed" };
  }

  // Add/New/First
  if (/^(Add|First)\b/i.test(text)) {
    return { text: humanize(text), tag: "new" };
  }

  // Improve/Update/Change/Switch/Move
  if (
    /^(Improve|Update|Change|Switch|Move|Show|Bundle|Resolve|Shell)\b/i.test(
      text,
    )
  ) {
    return { text: humanize(text), tag: "improved" };
  }

  // Default
  return { text: humanize(text), tag: "improved" };
}

function humanize(text: string): string {
  return text.replace(/\s*—\s*/g, " — ");
}

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = markdown.split("\n");

  let currentVersion: string | null = null;
  let currentUnpublished = false;
  let currentChanges: ChangelogChange[] = [];
  let inSecuritySection = false;

  for (const line of lines) {
    // Version header
    const versionMatch = line.match(/^## (v[\d.]+)(\s+\(unpublished\))?/);
    if (versionMatch) {
      if (currentVersion) {
        entries.push({ version: currentVersion, unpublished: currentUnpublished, changes: currentChanges });
      }
      currentVersion = versionMatch[1];
      currentUnpublished = !!versionMatch[2];
      currentChanges = [];
      inSecuritySection = false;
      continue;
    }

    // Security sub-section
    if (/^- Security:/i.test(line.trim())) {
      inSecuritySection = true;
      continue;
    }

    // Sub-section header (e.g., "- Improve `cf host`:")
    if (/^- .+:$/.test(line.trim())) {
      inSecuritySection = /security/i.test(line);
      continue;
    }

    // Change items (top-level or indented)
    const changeMatch = line.match(/^\s{0,4}-\s+(.+)/);
    if (changeMatch && currentVersion) {
      const change = classifyChange(changeMatch[0].trim());
      if (inSecuritySection) {
        change.tag = "security";
      }
      currentChanges.push(change);
    }
  }

  if (currentVersion) {
    entries.push({ version: currentVersion, unpublished: currentUnpublished, changes: currentChanges });
  }

  return entries;
}
