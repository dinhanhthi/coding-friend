"use strict";

/**
 * Project registry writer for SessionStart hooks.
 *
 *   node project-registry.cjs record <path> <host>
 *
 * Upserts <path> into the registry read by `cf project` (cli/src/lib/project-registry.ts):
 *   {"schemaVersion":1,"projects":[{"path","hosts":[],"firstSeen","lastSeen"}]}
 * File: $CF_PROJECTS_FILE, else ~/.coding-friend/projects.json.
 *
 * Hook-safe: zero dependencies, never writes stdout, every error is swallowed
 * (exit 0). A corrupt registry or unknown schemaVersion is never overwritten.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

/** Mirror of TS canonicalProjectPath: resolve, then realpath when it exists. */
function canonicalPath(p) {
  const abs = path.resolve(p);
  return fs.existsSync(abs) ? fs.realpathSync(abs) : abs;
}

function registryFile() {
  return (
    process.env.CF_PROJECTS_FILE ||
    path.join(os.homedir(), ".coding-friend", "projects.json")
  );
}

/** `projectRegistry` from a config.json, or undefined when unset/unreadable. */
function readSetting(dir) {
  try {
    const raw = fs.readFileSync(
      path.join(dir, ".coding-friend", "config.json"),
      "utf8",
    );
    const v = JSON.parse(raw).projectRegistry;
    return typeof v === "boolean" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Local overrides global; default true. */
function isEnabled(projectDir) {
  const local = readSetting(projectDir);
  if (local !== undefined) return local;
  const global = readSetting(os.homedir());
  return global !== undefined ? global : true;
}

function isEntry(e) {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof e.path === "string" &&
    Array.isArray(e.hosts) &&
    e.hosts.every((h) => typeof h === "string") &&
    typeof e.firstSeen === "string" &&
    typeof e.lastSeen === "string"
  );
}

function isRegistry(r) {
  return (
    typeof r === "object" &&
    r !== null &&
    r.schemaVersion === 1 &&
    Array.isArray(r.projects) &&
    r.projects.every(isEntry)
  );
}

/** Missing → empty registry; unreadable → null (caller must not write). */
function readRegistry(file) {
  if (!fs.existsSync(file)) return { schemaVersion: 1, projects: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return isRegistry(data) ? data : null;
  } catch {
    return null;
  }
}

/** Same format as TS writeJsonAtomic: temp file in the same dir + rename. */
function writeAtomic(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best effort
    }
    throw err;
  }
}

/** Upsert a project. Returns true when the registry was written. */
function record(projectPath, host) {
  if (!projectPath) return false;
  const canonical = canonicalPath(projectPath);
  if (canonical === "/" || canonical === canonicalPath(os.homedir())) {
    return false;
  }
  if (!isEnabled(canonical)) return false;

  const file = registryFile();
  const registry = readRegistry(file);
  if (!registry) return false;

  const now = new Date().toISOString();
  let entry = registry.projects.find((p) => p.path === canonical);
  if (!entry) {
    entry = { path: canonical, hosts: [], firstSeen: now, lastSeen: now };
    registry.projects.push(entry);
  }
  if (host && !entry.hosts.includes(host)) entry.hosts.push(host);
  entry.lastSeen = now;
  writeAtomic(file, registry);
  return true;
}

module.exports = { record, canonicalPath, isEnabled, readRegistry };

if (require.main === module) {
  try {
    const [cmd, projectPath, host] = process.argv.slice(2);
    if (cmd === "record") record(projectPath, host);
  } catch (err) {
    if (process.env.CF_DEBUG) {
      process.stderr.write(`project-registry: ${err && err.message}\n`);
    }
  }
  process.exitCode = 0;
}
