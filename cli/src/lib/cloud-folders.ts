import { existsSync, readdirSync, realpathSync, statSync } from "fs";
import { basename, dirname, join, resolve, sep } from "path";

export type CloudProvider =
  | "icloud"
  | "google-drive"
  | "dropbox"
  | "onedrive"
  | "other";

export interface CloudRoot {
  provider: CloudProvider;
  root: string;
}

export interface CloudFolder extends CloudRoot {
  label: string;
  /** Suggested learn folder: always a fixed subfolder, never `root` itself. */
  path: string;
  exists: boolean;
}

export const LEARN_SUBFOLDER = "coding-friend-learn";

interface RootEntry extends CloudRoot {
  label: string;
  /** Parent of the suggested learn folder (Google Drive: `<root>/My Drive`). */
  base: string | null;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDirs(dir: string, match: RegExp = /^[^.]/): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => match.test(name) && isDir(join(dir, name)))
      .sort();
  } catch {
    return [];
  }
}

/** `GoogleDrive-me@x.com` -> "Google Drive (me@x.com)". */
function withSuffix(label: string, name: string, prefix: string): string {
  const rest = name.slice(prefix.length).replace(/^[-\s]+/, "");
  return rest ? `${label} (${rest.replace(/^\((.*)\)$/, "$1")})` : label;
}

/**
 * Existing cloud roots. macOS only: the table below follows each vendor's
 * macOS layout; other platforms return [].
 * - iCloud Drive: ~/Library/Mobile Documents/com~apple~CloudDocs.
 * - File Provider apps (Google Drive for desktop, Dropbox, OneDrive):
 *   ~/Library/CloudStorage/<Provider>-<account>. Google Drive's root only
 *   holds "My Drive" and "Shared drives", so the learn folder goes in My Drive.
 * - Legacy Dropbox (not on File Provider): ~/Dropbox, ~/Dropbox (Personal), ...
 */
function cloudRoots(home: string, platform: NodeJS.Platform): RootEntry[] {
  if (platform !== "darwin") return [];
  const roots: RootEntry[] = [];

  const icloud = join(
    home,
    "Library",
    "Mobile Documents",
    "com~apple~CloudDocs",
  );
  if (isDir(icloud)) {
    roots.push({
      provider: "icloud",
      label: "iCloud Drive",
      root: icloud,
      base: icloud,
    });
  }

  const storage = join(home, "Library", "CloudStorage");
  for (const name of listDirs(storage)) {
    const root = join(storage, name);
    if (name.startsWith("GoogleDrive-")) {
      const myDrive = join(root, "My Drive");
      roots.push({
        provider: "google-drive",
        label: withSuffix("Google Drive", name, "GoogleDrive"),
        root,
        base: isDir(myDrive) ? myDrive : null,
      });
    } else if (name.startsWith("Dropbox")) {
      roots.push({
        provider: "dropbox",
        label: withSuffix("Dropbox", name, "Dropbox"),
        root,
        base: root,
      });
    } else if (name.startsWith("OneDrive-")) {
      roots.push({
        provider: "onedrive",
        label: withSuffix("OneDrive", name, "OneDrive"),
        root,
        base: root,
      });
    } else {
      // Any other File Provider domain is still a cloud folder (no suggestion).
      roots.push({ provider: "other", label: name, root, base: null });
    }
  }

  for (const name of listDirs(home, /^Dropbox( \(.+\))?$/)) {
    const root = join(home, name);
    roots.push({
      provider: "dropbox",
      label: withSuffix("Dropbox", name, "Dropbox"),
      root,
      base: root,
    });
  }
  return roots;
}

/** Suggested learn folders, one per cloud root found (macOS only). */
export function detectCloudFolders(
  home: string,
  platform: NodeJS.Platform,
): CloudFolder[] {
  return cloudRoots(home, platform).flatMap(
    ({ provider, label, root, base }) => {
      if (base === null) return [];
      const path = join(base, LEARN_SUBFOLDER);
      return [{ provider, label, root, path, exists: isDir(path) }];
    },
  );
}

/** Real path of `p`, resolving the nearest existing ancestor when `p` is missing. */
function realish(p: string): string {
  let cur = p;
  const tail: string[] = [];
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) return p;
    tail.unshift(basename(cur));
    cur = parent;
  }
  try {
    return join(realpathSync(cur), ...tail);
  } catch {
    return p;
  }
}

function inside(p: string, root: string): boolean {
  return p === root || p.startsWith(root + sep);
}

/** The cloud root containing `path`, or null (macOS only). */
export function cloudRootOf(
  path: string,
  home: string,
  platform: NodeJS.Platform,
): CloudRoot | null {
  const candidates = [resolve(path), realish(resolve(path))];
  for (const { provider, root } of cloudRoots(home, platform)) {
    const roots = [root, realish(root)];
    if (candidates.some((c) => roots.some((r) => inside(c, r)))) {
      return { provider, root };
    }
  }
  return null;
}

/**
 * True when a directory entry is a cloud file that is not downloaded yet.
 * Decided from the name and lstat only: never open or read the file, since
 * reading a dataless file makes the provider download it.
 * - Legacy iCloud placeholder `.name.md.icloud` (any platform).
 * - macOS (darwin only): File Provider dataless file (iCloud Drive since
 *   Sonoma, Google Drive, Dropbox, OneDrive) has `size > 0` and `blocks === 0`.
 *   The exact signal is the SF_DATALESS (0x40000000) bit of st_flags (SDK
 *   sys/stat.h), shown by `stat -f %Sf` as "dataless", but Node's fs.Stats
 *   does not expose st_flags. APFS transparent compression (UF_COMPRESSED,
 *   decmpfs) can also give `blocks === 0` for tiny files stored inline, so
 *   the heuristic may flag such a file: the safe direction (it is listed,
 *   never opened).
 */
export function isCloudPlaceholder(
  name: string,
  lstat: { size: number; blocks: number; isFile(): boolean } | null,
  platform: NodeJS.Platform,
): boolean {
  if (/^\..+\.icloud$/.test(name)) return true;
  if (platform !== "darwin" || lstat === null || !lstat.isFile()) return false;
  return lstat.size > 0 && lstat.blocks === 0;
}
