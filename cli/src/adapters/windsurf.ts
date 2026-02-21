import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { PlatformAdapter, GeneratedFile, GenerateOptions, InstallScope, GlobalPathInfo } from "./types.js";
import { compileSkill } from "./core/skill-compiler.js";
import { compileHooksForPlatform } from "./core/hooks-compiler.js";

// ---------------------------------------------------------------------------
// Windsurf platform adapter
// ---------------------------------------------------------------------------

export const windsurfAdapter: PlatformAdapter = {
  id: "windsurf",
  name: "Windsurf",

  // -- Detection -------------------------------------------------------------

  detect(projectRoot: string): boolean {
    return existsSync(join(projectRoot, ".windsurf"));
  },

  // -- Capabilities ----------------------------------------------------------

  supportsGlobalInstall(): boolean {
    return true; // hooks only — no global rules dir
  },

  supportsHooks(): boolean {
    return true;
  },

  supportsMCP(): boolean {
    return true;
  },

  // -- Generation ------------------------------------------------------------

  generate(scope: InstallScope, options: GenerateOptions): GeneratedFile[] {
    if (scope === "global") {
      return generateGlobal(options);
    }
    return generateLocal(options);
  },

  // -- Metadata --------------------------------------------------------------

  getOutputPaths(scope: InstallScope, options: GenerateOptions): string[] {
    return this.generate(scope, options).map((f) => f.path);
  },

  getGitignorePatterns(): string[] {
    return [".windsurf/rules/cf-*", ".windsurf/hooks/cf-*"];
  },

  getGlobalPaths(): GlobalPathInfo {
    return {
      hooks: "~/.codeium/windsurf/hooks.json",
      note: "Windsurf: global hooks only, rules are project-level",
    };
  },
};

// ---------------------------------------------------------------------------
// Global scope: hooks only → ~/.codeium/windsurf/
// ---------------------------------------------------------------------------

function generateGlobal(options: GenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const { hooks } = options;

  if (hooks.length === 0) return files;

  const globalDir = join(homedir(), ".codeium", "windsurf");
  const scriptsDir = join(globalDir, "hooks");

  const compiled = compileHooksForPlatform(hooks, "windsurf", scriptsDir);

  if (compiled.config) {
    files.push({
      path: join(globalDir, "hooks.json"),
      content: compiled.config,
      merge: true,
    });
  }

  files.push(...compiled.scripts);

  return files;
}

// ---------------------------------------------------------------------------
// Local scope: rules + hooks → .windsurf/
// ---------------------------------------------------------------------------

function generateLocal(options: GenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const { projectRoot, skills, hooks } = options;

  const windsurfDir = join(projectRoot, ".windsurf");

  // --- Rules: one file per skill -------------------------------------------

  for (const skill of skills) {
    const compiled = compileSkill(skill, "windsurf");
    files.push({
      path: join(windsurfDir, "rules", `cf-${skill.dirName}.md`),
      content: compiled,
    });
  }

  // --- Hooks: config + scripts ---------------------------------------------

  if (hooks.length > 0) {
    const scriptsDir = join(windsurfDir, "hooks");
    const compiled = compileHooksForPlatform(hooks, "windsurf", scriptsDir);

    if (compiled.config) {
      files.push({
        path: join(windsurfDir, "hooks.json"),
        content: compiled.config,
      });
    }

    files.push(...compiled.scripts);
  }

  return files;
}
