import { lstatSync, readdirSync, statSync, type Stats } from "fs";
import { homedir } from "os";
import { join } from "path";

import {
  cloudRootOf,
  conflictBaseOf,
  isCloudPlaceholder,
  type CloudRoot,
} from "./cloud-folders.js";
import { resolveLearnDir, resolveSessionDir } from "./config.js";
import type { CodingFriendConfig } from "../types.js";

/** Walk budget per kind: stop after this many directory entries. */
export const MAX_SYNC_ENTRIES = 20000;

const LEGACY_ICLOUD = /^\.(.+)\.icloud$/;
const SAVED_FILES = ["meta.json", "session.jsonl"];

export interface SyncKindStatus {
  kind: "learn" | "sessions";
  dir: string;
  exists: boolean;
  cloud: CloudRoot | null;
  /** Learn: `.md` notes; sessions: session folders. Placeholders included. */
  files: number;
  placeholders: number;
  conflicts: number;
  truncated: boolean;
}

export interface SyncStatus {
  kinds: SyncKindStatus[];
  notSynced: ["globalConfig", "projectList"];
}

interface Budget {
  left: number;
  truncated: boolean;
}

function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

function isDirFollow(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Entry names of `dir` within the budget; [] when unreadable. */
function entries(dir: string, budget: Budget): string[] {
  if (budget.truncated) return [];
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch {
    return [];
  }
  if (names.length > budget.left) {
    names = names.slice(0, budget.left);
    budget.truncated = true;
  }
  budget.left -= names.length;
  return names;
}

function countConflicts(
  names: Iterable<string>,
  siblings: Set<string>,
  oneDrive: boolean,
): number {
  let n = 0;
  for (const name of names) {
    if (conflictBaseOf(name, siblings, oneDrive) !== null) n++;
  }
  return n;
}

/** `<dir>/<category>/<slug>.md`, as learn-notes lists them. Never opens a note. */
function walkLearn(dir: string, cloud: CloudRoot | null, budget: Budget) {
  const oneDrive = cloud?.provider === "onedrive";
  let files = 0;
  let placeholders = 0;
  let conflicts = 0;
  for (const category of entries(dir, budget)) {
    if (category.startsWith(".")) continue;
    const catDir = join(dir, category);
    if (!lstatOrNull(catDir)?.isDirectory()) continue;
    const slugs = new Set<string>();
    for (const name of entries(catDir, budget)) {
      const legacy = /^\.(.+)\.md\.icloud$/.exec(name);
      if (legacy) {
        slugs.add(legacy[1]);
        placeholders++;
        continue;
      }
      if (name.startsWith(".") || !name.endsWith(".md") || name === "README.md")
        continue;
      const st = lstatOrNull(join(catDir, name));
      if (!st?.isFile()) continue;
      slugs.add(name.slice(0, -3));
      if (cloud && isCloudPlaceholder(name, st, process.platform))
        placeholders++;
    }
    files += slugs.size;
    conflicts += countConflicts(slugs, slugs, oneDrive);
  }
  return { files, placeholders, conflicts };
}

/** `<dir>/<folder>/{meta.json,session.jsonl}`. Stat only, never opens a file. */
function walkSessions(dir: string, cloud: CloudRoot | null, budget: Budget) {
  const oneDrive = cloud?.provider === "onedrive";
  const folders: string[] = [];
  let placeholders = 0;
  let conflicts = 0;
  for (const folder of entries(dir, budget)) {
    if (folder.startsWith(".")) continue;
    const folderDir = join(dir, folder);
    if (!lstatOrNull(folderDir)?.isDirectory()) continue;
    folders.push(folder);

    // In-folder conflict copies (`session 2.jsonl`, `meta 2.json`), by stem per extension.
    const stems = new Map<string, Set<string>>();
    for (const entry of entries(folderDir, budget)) {
      const name = LEGACY_ICLOUD.exec(entry)?.[1] ?? entry;
      if (name.startsWith(".")) continue;
      const dot = name.lastIndexOf(".");
      if (dot <= 0) continue;
      const ext = name.slice(dot);
      if (!stems.has(ext)) stems.set(ext, new Set());
      stems.get(ext)!.add(name.slice(0, dot));
    }
    for (const set of stems.values()) {
      conflicts += countConflicts(set, set, oneDrive);
    }

    const placeholder = SAVED_FILES.some((name) => {
      if (lstatOrNull(join(folderDir, `.${name}.icloud`))?.isFile())
        return true;
      const st = lstatOrNull(join(folderDir, name));
      return (
        cloud !== null &&
        st !== null &&
        isCloudPlaceholder(name, st, process.platform)
      );
    });
    if (placeholder) placeholders++;
  }
  conflicts += countConflicts(folders, new Set(folders), oneDrive);
  return { files: folders.length, placeholders, conflicts };
}

function kindStatus(kind: SyncKindStatus["kind"], dir: string): SyncKindStatus {
  const cloud = cloudRootOf(dir, homedir(), process.platform);
  const budget: Budget = { left: MAX_SYNC_ENTRIES, truncated: false };
  const exists = isDirFollow(dir);
  const counts = !exists
    ? { files: 0, placeholders: 0, conflicts: 0 }
    : kind === "learn"
      ? walkLearn(dir, cloud, budget)
      : walkSessions(dir, cloud, budget);
  return { kind, dir, exists, cloud, ...counts, truncated: budget.truncated };
}

/**
 * Where learn notes and saved sessions live, whether that is a cloud folder,
 * and how many placeholders and conflict copies it holds. CF has no sync
 * engine: this only reads directory entries and lstat, never a file.
 * `globalCfg` is the global config (never the merged one).
 */
export function syncStatus(globalCfg: CodingFriendConfig | null): SyncStatus {
  return {
    kinds: [
      kindStatus("learn", resolveLearnDir(globalCfg)),
      kindStatus("sessions", resolveSessionDir(globalCfg)),
    ],
    notSynced: ["globalConfig", "projectList"],
  };
}
