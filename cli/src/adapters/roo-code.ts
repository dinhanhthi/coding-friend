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
import { compileSkill } from "./core/skill-compiler.js";
import { extractSecurityRulesText, extractDevRulesText } from "./core/hooks-compiler.js";

// ---------------------------------------------------------------------------
// Roo Code adapter
// ---------------------------------------------------------------------------

export const rooCodeAdapter: PlatformAdapter = {
  id: "roo-code",
  name: "Roo Code",

  // -- Detection -------------------------------------------------------------

  detect(projectRoot: string): boolean {
    return existsSync(join(projectRoot, ".roo"));
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

    if (scope === "local") {
      const rulesDir = join(options.projectRoot, ".roo", "rules");

      // Generate a rule file per skill
      for (const skill of options.skills) {
        files.push({
          path: join(rulesDir, `cf-${skill.dirName}.md`),
          content: compileSkill(skill, "roo-code"),
        });
      }

      // Embed security + dev rules since hooks are not supported
      const securityRules = extractSecurityRulesText(options.hooks);
      const devRules = extractDevRulesText(options.hooks);
      const coreContent = [securityRules, devRules].filter(Boolean).join("\n");

      if (coreContent) {
        files.push({
          path: join(rulesDir, "cf-core-rules.md"),
          content: coreContent,
        });
      }
    }

    if (scope === "global") {
      const globalRulesDir = join(homedir(), ".roo", "rules");

      for (const skill of options.skills) {
        files.push({
          path: join(globalRulesDir, `cf-${skill.dirName}.md`),
          content: compileSkill(skill, "roo-code"),
        });
      }

      const securityRules = extractSecurityRulesText(options.hooks);
      const devRules = extractDevRulesText(options.hooks);
      const coreContent = [securityRules, devRules].filter(Boolean).join("\n");

      if (coreContent) {
        files.push({
          path: join(globalRulesDir, "cf-core-rules.md"),
          content: coreContent,
        });
      }
    }

    return files;
  },

  // -- Metadata --------------------------------------------------------------

  getOutputPaths(scope: InstallScope, options: GenerateOptions): string[] {
    const paths: string[] = [];

    if (scope === "local") {
      const rulesDir = join(options.projectRoot, ".roo", "rules");
      for (const skill of options.skills) {
        paths.push(join(rulesDir, `cf-${skill.dirName}.md`));
      }
      if (options.hooks.length > 0) {
        paths.push(join(rulesDir, "cf-core-rules.md"));
      }
    }

    if (scope === "global") {
      const globalRulesDir = join(homedir(), ".roo", "rules");
      for (const skill of options.skills) {
        paths.push(join(globalRulesDir, `cf-${skill.dirName}.md`));
      }
      if (options.hooks.length > 0) {
        paths.push(join(globalRulesDir, "cf-core-rules.md"));
      }
    }

    return paths;
  },

  getGitignorePatterns(): string[] {
    return [".roo/rules/cf-*"];
  },

  getGlobalPaths(): GlobalPathInfo {
    return {
      rules: join(homedir(), ".roo", "rules"),
    };
  },
};
