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
import { mergeIntoFile } from "./core/rules-builder.js";
import { compileSkillsToSingleDoc } from "./core/skill-compiler.js";
import { extractSecurityRulesText, extractDevRulesText } from "./core/hooks-compiler.js";

// ---------------------------------------------------------------------------
// OpenCode adapter
// ---------------------------------------------------------------------------

export const opencodeAdapter: PlatformAdapter = {
  id: "opencode",
  name: "OpenCode",

  // -- Detection -------------------------------------------------------------

  detect(projectRoot: string): boolean {
    return (
      existsSync(join(projectRoot, ".opencode")) ||
      existsSync(join(projectRoot, "opencode.json"))
    );
  },

  // -- Capabilities ----------------------------------------------------------

  supportsGlobalInstall(): boolean {
    return true;
  },

  supportsHooks(): boolean {
    return false;
  },

  supportsMCP(): boolean {
    return true;
  },

  // -- Generation ------------------------------------------------------------

  generate(scope: InstallScope, options: GenerateOptions): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Build combined content: skills + security rules
    const skillsDoc = compileSkillsToSingleDoc(options.skills, "opencode");
    const securityRules = extractSecurityRulesText(options.hooks);
    const devRules = extractDevRulesText(options.hooks);
    const combined = [skillsDoc, securityRules, devRules].filter(Boolean).join("\n\n");

    if (scope === "local") {
      const agentsPath = join(options.projectRoot, "AGENTS.md");
      files.push({
        path: agentsPath,
        content: mergeIntoFile(agentsPath, combined),
        merge: true,
      });
    }

    if (scope === "global") {
      const globalAgentsPath = join(homedir(), ".config", "opencode", "AGENTS.md");
      files.push({
        path: globalAgentsPath,
        content: mergeIntoFile(globalAgentsPath, combined),
        merge: true,
      });
    }

    return files;
  },

  // -- Metadata --------------------------------------------------------------

  getOutputPaths(scope: InstallScope, options: GenerateOptions): string[] {
    const paths: string[] = [];

    if (scope === "local") {
      paths.push(join(options.projectRoot, "AGENTS.md"));
    }

    if (scope === "global") {
      paths.push(join(homedir(), ".config", "opencode", "AGENTS.md"));
    }

    return paths;
  },

  getGitignorePatterns(): string[] {
    // AGENTS.md is usually committed
    return [];
  },

  getGlobalPaths(): GlobalPathInfo {
    return {
      rules: join(homedir(), ".config", "opencode", "AGENTS.md"),
    };
  },
};
