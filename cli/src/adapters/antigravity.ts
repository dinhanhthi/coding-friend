import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  PlatformAdapter,
  GeneratedFile,
  GenerateOptions,
  InstallScope,
  GlobalPathInfo,
  ParsedSkill,
} from "./types.js";
import { mergeIntoFile } from "./core/rules-builder.js";
import { compileSkill, compileSkillsToSingleDoc } from "./core/skill-compiler.js";
import { extractSecurityRulesText, extractDevRulesText } from "./core/hooks-compiler.js";

// ---------------------------------------------------------------------------
// Antigravity adapter
// ---------------------------------------------------------------------------

/**
 * Format a skill as a workflow file with YAML frontmatter.
 */
function formatWorkflow(skill: ParsedSkill): string {
  return [
    "---",
    `name: cf-${skill.dirName}`,
    `description: ${skill.description}`,
    "---",
    skill.body,
  ].join("\n");
}

export const antigravityAdapter: PlatformAdapter = {
  id: "antigravity",
  name: "Antigravity",

  // -- Detection -------------------------------------------------------------

  detect(projectRoot: string): boolean {
    return existsSync(join(projectRoot, ".agent"));
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
      const agentDir = join(options.projectRoot, ".agent");

      // Rules: one file per skill
      for (const skill of options.skills) {
        files.push({
          path: join(agentDir, "rules", `cf-${skill.dirName}.md`),
          content: compileSkill(skill, "antigravity"),
        });
      }

      // Skills: copy raw SKILL.md for each skill
      for (const skill of options.skills) {
        files.push({
          path: join(agentDir, "skills", "coding-friend", skill.dirName, "SKILL.md"),
          content: skill.raw,
        });
      }

      // Workflows: only for user-invocable skills
      for (const skill of options.skills) {
        if (skill.userInvocable) {
          files.push({
            path: join(agentDir, "workflows", `cf-${skill.dirName}.md`),
            content: formatWorkflow(skill),
          });
        }
      }

      // Embed security + dev rules since hooks are not supported
      const securityRules = extractSecurityRulesText(options.hooks);
      const devRules = extractDevRulesText(options.hooks);
      const coreContent = [securityRules, devRules].filter(Boolean).join("\n");

      if (coreContent) {
        files.push({
          path: join(agentDir, "rules", "cf-core-rules.md"),
          content: coreContent,
        });
      }
    }

    if (scope === "global") {
      // Global rules: append to ~/.gemini/GEMINI.md
      const skillsDoc = compileSkillsToSingleDoc(options.skills, "antigravity");
      const securityRules = extractSecurityRulesText(options.hooks);
      const devRules = extractDevRulesText(options.hooks);
      const combined = [skillsDoc, securityRules, devRules].filter(Boolean).join("\n\n");

      const globalGeminiPath = join(homedir(), ".gemini", "GEMINI.md");
      files.push({
        path: globalGeminiPath,
        content: mergeIntoFile(globalGeminiPath, combined),
        merge: true,
      });

      // Copy skills globally
      for (const skill of options.skills) {
        files.push({
          path: join(
            homedir(),
            ".gemini",
            "antigravity",
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
      const agentDir = join(options.projectRoot, ".agent");

      for (const skill of options.skills) {
        paths.push(join(agentDir, "rules", `cf-${skill.dirName}.md`));
        paths.push(join(agentDir, "skills", "coding-friend", skill.dirName, "SKILL.md"));
        if (skill.userInvocable) {
          paths.push(join(agentDir, "workflows", `cf-${skill.dirName}.md`));
        }
      }

      if (options.hooks.length > 0) {
        paths.push(join(agentDir, "rules", "cf-core-rules.md"));
      }
    }

    if (scope === "global") {
      paths.push(join(homedir(), ".gemini", "GEMINI.md"));
      for (const skill of options.skills) {
        paths.push(
          join(
            homedir(),
            ".gemini",
            "antigravity",
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
    return [
      ".agent/rules/cf-*",
      ".agent/skills/coding-friend/",
      ".agent/workflows/cf-*",
    ];
  },

  getGlobalPaths(): GlobalPathInfo {
    return {
      rules: join(homedir(), ".gemini", "GEMINI.md"),
      skills: join(homedir(), ".gemini", "antigravity", "skills", "coding-friend"),
    };
  },
};
