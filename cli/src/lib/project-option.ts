import { realpathSync, statSync, type Stats } from "fs";
import { resolve } from "path";
import { CliError } from "./output.js";
import { resolveMainRepoRoot } from "./project-root.js";

/**
 * `--project-dir <path>`: resolve it against cwd to the main repo root and
 * chdir there, so cwd-based lookups (local config, docsDir, memory) target
 * that project. No value → undefined, cwd untouched. Call it inside the
 * runJson/runHuman callback so its CliError becomes an envelope.
 */
export function useProjectDir(projectDir?: string): string | undefined {
  if (!projectDir) return undefined;
  const abs = resolve(process.cwd(), projectDir);
  let stat: Stats;
  try {
    stat = statSync(abs);
  } catch {
    throw new CliError("NOT_FOUND", `Project directory not found: ${abs}`);
  }
  if (!stat.isDirectory()) {
    throw new CliError("INVALID_ARGS", `Not a directory: ${abs}`);
  }
  const root = resolveMainRepoRoot(realpathSync(abs));
  process.chdir(root);
  return root;
}
