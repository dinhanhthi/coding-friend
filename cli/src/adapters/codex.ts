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
// Codex adapter
// ---------------------------------------------------------------------------

export const codexAdapter: PlatformAdapter = {
  id: "codex",
  name: "Codex",

  // -- Detection -------------------------------------------------------------

  detect(projectRoot: string): boolean {
    return (
      existsSync(join(projectRoot, ".codex")) ||
      existsSync(join(projectRoot, ".agents"))
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
    const skillsDoc = compileSkillsToSingleDoc(options.skills, "codex");
    const securityRules = extractSecurityRulesText(options.hooks);
    const devRules = extractDevRulesText(options.hooks);
    const combined = [skillsDoc, securityRules, devRules].filter(Boolean).join("\n\n");

    if (scope === "local") {
      // AGENTS.md at project root
      const agentsPath = join(options.projectRoot, "AGENTS.md");
      files.push({
        path: agentsPath,
        content: mergeIntoFile(agentsPath, combined),
        merge: true,
      });

      // Copy each skill as individual SKILL.md files
      for (const skill of options.skills) {
        files.push({
          path: join(
            options.projectRoot,
            ".agents",
            "skills",
            "coding-friend",
            skill.dirName,
            "SKILL.md",
          ),
          content: skill.raw,
        });
      }
    }

    if (scope === "global") {
      // Global AGENTS.md
      const globalAgentsPath = join(homedir(), ".codex", "AGENTS.md");
      files.push({
        path: globalAgentsPath,
        content: mergeIntoFile(globalAgentsPath, combined),
        merge: true,
      });

      // Copy each skill globally
      for (const skill of options.skills) {
        files.push({
          path: join(
            homedir(),
            ".agents",
            "skills",
            "coding-friend",
            skill.dirName,
            "SKILL.md",
          ),
          content: skill.raw,
        });
      }
    }

    return files;
  },

  // -- Metadata --------------------------------------------------------------

  getOutputPaths(scope: InstallScope, options: GenerateOptions): string[] {
    const paths: string[] = [];

    if (scope === "local") {
      paths.push(join(options.projectRoot, "AGENTS.md"));
      for (const skill of options.skills) {
        paths.push(
          join(
            options.projectRoot,
            ".agents",
            "skills",
            "coding-friend",
            skill.dirName,
            "SKILL.md",
          ),
        );
      }
    }

    if (scope === "global") {
      paths.push(join(homedir(), ".codex", "AGENTS.md"));
      for (const skill of options.skills) {
        paths.push(
          join(
            homedir(),
            ".agents",
            "skills",
            "coding-friend",
            skill.dirName,
            "SKILL.md",
          ),
        );
      }
    }

    return paths;
  },

  getGitignorePatterns(): string[] {
    return [".agents/skills/coding-friend/"];
  },

  getGlobalPaths(): GlobalPathInfo {
    return {
      rules: join(homedir(), ".codex", "AGENTS.md"),
      skills: join(homedir(), ".agents", "skills", "coding-friend"),
    };
  },
};
