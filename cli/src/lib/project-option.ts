import { realpathSync, statSync, type Stats } from "fs";
import { resolve } from "path";
import { CliError } from "./output.js";
import { resolveMainRepoRoot } from "./project-root.js";

/**
 * `--project-dir <path>`: resolve it against cwd to the main repo root and
 * chdir there, so cwd-based lookups (local config, docsDir, memory) target
 * that project. No flag → undefined, cwd untouched; an empty value (an unset
 * `$DIR`) is INVALID_ARGS. Call it inside the runJson/runHuman callback so
 * its CliError becomes an envelope.
 */
export function useProjectDir(projectDir?: string): string | undefined {
  if (projectDir === undefined) return undefined;
  if (projectDir === "") {
    throw new CliError("INVALID_ARGS", "--project-dir needs a non-empty path");
  }
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
