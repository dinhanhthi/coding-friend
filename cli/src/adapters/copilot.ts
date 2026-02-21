import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  PlatformAdapter,
  GeneratedFile,
  GenerateOptions,
  InstallScope,
  GlobalPathInfo,
} from "./types.js";
import { compileSkill, compileSkillsToSingleDoc } from "./core/skill-compiler.js";
import { compileHooksForPlatform } from "./core/hooks-compiler.js";
import { mergeIntoFile } from "./core/rules-builder.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const GLOBAL_INSTRUCTIONS_PATH = join(
  homedir(),
  ".config",
  "github-copilot",
  "global-copilot-instructions.md",
);

function localInstructionsPath(projectRoot: string): string {
  return join(projectRoot, ".github", "copilot-instructions.md");
}

function localInstructionsDir(projectRoot: string): string {
  return join(projectRoot, ".github", "instructions");
}

function localHooksDir(projectRoot: string): string {
  return join(projectRoot, ".github", "hooks");
}

function localHooksConfigPath(projectRoot: string): string {
  return join(projectRoot, ".github", "hooks", "coding-friend.json");
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const copilotAdapter: PlatformAdapter = {
  id: "copilot",
  name: "GitHub Copilot",

  // -- Detection -------------------------------------------------------------

  detect(projectRoot: string): boolean {
    return (
      existsSync(join(projectRoot, ".github", "copilot-instructions.md")) ||
      existsSync(join(projectRoot, ".github", "instructions"))
    );
  },

  // -- Capabilities ----------------------------------------------------------

  supportsGlobalInstall(): boolean {
    return true;
  },

  supportsHooks(): boolean {
    return true;
  },

  supportsMCP(): boolean {
    return false;
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
    if (scope === "global") {
      return [GLOBAL_INSTRUCTIONS_PATH];
    }

    const paths: string[] = [localInstructionsPath(options.projectRoot)];

    // Per-skill instruction files
    for (const skill of options.skills) {
      paths.push(
        join(localInstructionsDir(options.projectRoot), `cf-${skill.dirName}.instructions.md`),
      );
    }

    // Hooks config + scripts
    if (options.hooks.length > 0) {
      paths.push(localHooksConfigPath(options.projectRoot));
      for (const hook of options.hooks) {
        paths.push(join(localHooksDir(options.projectRoot), `cf-${hook.scriptName}`));
      }
    }

    return paths;
  },

  getGitignorePatterns(): string[] {
    return [".github/instructions/cf-*", ".github/hooks/cf-*"];
  },

  getGlobalPaths(): GlobalPathInfo {
    return {
      rules: "~/.config/github-copilot/global-copilot-instructions.md",
      note: "Copilot: global instructions only, hooks are repo-level",
    };
  },
};

// ---------------------------------------------------------------------------
// Global scope generation
// ---------------------------------------------------------------------------

function generateGlobal(options: GenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Build a single combined document from all skills
  const doc = compileSkillsToSingleDoc(options.skills, "copilot", 900);

  // Merge into the global instructions file using section markers
  const content = mergeIntoFile(GLOBAL_INSTRUCTIONS_PATH, doc);

  files.push({
    path: GLOBAL_INSTRUCTIONS_PATH,
    content,
    merge: true,
  });

  return files;
}

// ---------------------------------------------------------------------------
// Local scope generation
// ---------------------------------------------------------------------------

function generateLocal(options: GenerateOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // 1. Combined copilot-instructions.md
  const combinedDoc = compileSkillsToSingleDoc(options.skills, "copilot", 1000);
  files.push({
    path: localInstructionsPath(options.projectRoot),
    content: combinedDoc,
  });

  // 2. Per-skill instruction files in .github/instructions/
  for (const skill of options.skills) {
    const compiled = compileSkill(skill, "copilot");
    files.push({
      path: join(
        localInstructionsDir(options.projectRoot),
        `cf-${skill.dirName}.instructions.md`,
      ),
      content: compiled,
    });
  }

  // 3. Hooks config + scripts
  if (options.hooks.length > 0) {
    const hooksDir = localHooksDir(options.projectRoot);
    const { config, scripts } = compileHooksForPlatform(options.hooks, "copilot", hooksDir);

    if (config) {
      files.push({
        path: localHooksConfigPath(options.projectRoot),
        content: config,
      });
    }

    files.push(...scripts);
  }

  return files;
}
