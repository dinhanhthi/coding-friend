import { existsSync } from "fs";
import { join } from "path";
import type {
  PlatformAdapter,
  GeneratedFile,
  GenerateOptions,
  InstallScope,
  GlobalPathInfo,
} from "./types.js";
import { compileSkill } from "./core/skill-compiler.js";
import { compileHooksForPlatform } from "./core/hooks-compiler.js";

// ---------------------------------------------------------------------------
// Cursor platform adapter
// ---------------------------------------------------------------------------

export const cursorAdapter: PlatformAdapter = {
  id: "cursor",
  name: "Cursor",

  // -- Detection -----------------------------------------------------------

  detect(projectRoot: string): boolean {
    return existsSync(join(projectRoot, ".cursor"));
  },

  // -- Capabilities --------------------------------------------------------

  supportsGlobalInstall(): boolean {
    return false;
  },

  supportsHooks(): boolean {
    return true;
  },

  supportsMCP(): boolean {
    return true;
  },

  // -- Generation ----------------------------------------------------------

  generate(scope: InstallScope, options: GenerateOptions): GeneratedFile[] {
    if (scope === "global") return [];

    const files: GeneratedFile[] = [];

    // --- Rules: one .mdc file per skill ---
    for (const skill of options.skills) {
      const content = compileSkill(skill, "cursor");
      files.push({
        path: join(options.projectRoot, ".cursor", "rules", `cf-${skill.dirName}.mdc`),
        content,
      });
    }

    // --- Hooks: config + scripts ---
    const hooksScriptsDir = join(options.projectRoot, ".cursor", "hooks");
    const { config, scripts } = compileHooksForPlatform(options.hooks, "cursor", hooksScriptsDir);

    if (config) {
      files.push({
        path: join(options.projectRoot, ".cursor", "hooks.json"),
        content: config,
      });
    }

    for (const script of scripts) {
      files.push(script);
    }

    return files;
  },

  // -- Metadata ------------------------------------------------------------

  getOutputPaths(scope: InstallScope, options: GenerateOptions): string[] {
    if (scope === "global") return [];
    return this.generate(scope, options).map((f) => f.path);
  },

  getGitignorePatterns(): string[] {
    return [".cursor/rules/cf-*", ".cursor/hooks/cf-*"];
  },

  getGlobalPaths(): GlobalPathInfo {
    return {
      note: "Cursor global rules are configured via GUI Settings only",
    };
  },
};
