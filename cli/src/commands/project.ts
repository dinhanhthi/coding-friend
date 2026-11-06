import { existsSync } from "fs";
import { log } from "../lib/log.js";
import { CliError, runHuman, runJson } from "../lib/output.js";
import { resolvePath } from "../lib/paths.js";
import { resolveMainRepoRoot } from "../lib/project-root.js";
import {
  canonicalProjectPath,
  listProjects,
  removeProject,
  upsertProject,
} from "../lib/project-registry.js";

interface Flags {
  json?: boolean;
}

/** JSON mode → envelope; human mode → log CliError then exit 1 via runHuman. */
async function run<T>(
  json: boolean | undefined,
  fn: () => T,
  print: (data: T) => void,
): Promise<void> {
  if (json) {
    await runJson(fn);
    return;
  }
  await runHuman(() => {
    try {
      print(fn());
    } catch (err) {
      if (err instanceof CliError) log.error(err.message);
      throw err;
    }
  });
}

export async function projectListCommand(opts: Flags): Promise<void> {
  await run(opts.json, listProjects, ({ projects, warning }) => {
    if (warning) log.warn(warning);
    if (projects.length === 0) {
      console.log("No registered projects.");
      return;
    }
    for (const p of projects) {
      const hosts = p.hosts.length ? `  [${p.hosts.join(", ")}]` : "";
      const missing = p.exists ? "" : "  (missing)";
      console.log(`${p.path}${hosts}${missing}`);
    }
  });
}

export async function projectAddCommand(
  path: string | undefined,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      const abs = resolvePath(path ?? process.cwd());
      if (!existsSync(abs)) {
        throw new CliError("NOT_FOUND", `Path does not exist: ${abs}`);
      }
      return { project: upsertProject(resolveMainRepoRoot(abs)) };
    },
    ({ project }) => log.success(`Registered ${project.path}`),
  );
}

export async function projectRemoveCommand(
  path: string,
  opts: Flags,
): Promise<void> {
  await run(
    opts.json,
    () => {
      const abs = resolvePath(path);
      const canonical = canonicalProjectPath(abs);
      // Mirror `add`: a subdir or worktree maps to the registered main root.
      const main = existsSync(abs)
        ? canonicalProjectPath(resolveMainRepoRoot(abs))
        : canonical;
      if (main !== canonical && removeProject(main)) {
        return { path: main, removed: true };
      }
      if (!removeProject(canonical)) {
        throw new CliError(
          "NOT_FOUND",
          `${canonical} is not in the project registry`,
        );
      }
      return { path: canonical, removed: true };
    },
    (res) => log.success(`Removed ${res.path}`),
  );
}
