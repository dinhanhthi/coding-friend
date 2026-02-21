import { existsSync } from "fs";
import { join } from "path";
import type { PlatformAdapter, PlatformId } from "./types.js";

// Lazy-loaded adapter cache
const adapterCache = new Map<PlatformId, PlatformAdapter>();

/**
 * Get an adapter instance by platform ID.
 * Adapters are lazily imported and cached.
 */
export async function getAdapter(id: PlatformId): Promise<PlatformAdapter> {
  const cached = adapterCache.get(id);
  if (cached) return cached;

  let adapter: PlatformAdapter;

  switch (id) {
    case "cursor": {
      const m = await import("./cursor.js");
      adapter = m.cursorAdapter;
      break;
    }
    case "windsurf": {
      const m = await import("./windsurf.js");
      adapter = m.windsurfAdapter;
      break;
    }
    case "copilot": {
      const m = await import("./copilot.js");
      adapter = m.copilotAdapter;
      break;
    }
    case "roo-code": {
      const m = await import("./roo-code.js");
      adapter = m.rooCodeAdapter;
      break;
    }
    case "opencode": {
      const m = await import("./opencode.js");
      adapter = m.opencodeAdapter;
      break;
    }
    case "codex": {
      const m = await import("./codex.js");
      adapter = m.codexAdapter;
      break;
    }
    case "antigravity": {
      const m = await import("./antigravity.js");
      adapter = m.antigravityAdapter;
      break;
    }
    case "claude-code":
      throw new Error("Claude Code does not need an adapter — it uses the native plugin system.");
    default:
      throw new Error(`Unknown platform: ${id}`);
  }

  adapterCache.set(id, adapter);
  return adapter;
}

/**
 * Platform detection markers: directory or file whose presence
 * signals that a platform is used in the project.
 */
const DETECTION_MARKERS: Record<Exclude<PlatformId, "claude-code">, string[]> = {
  cursor: [".cursor"],
  windsurf: [".windsurf"],
  copilot: [".github/copilot-instructions.md", ".github/instructions"],
  "roo-code": [".roo"],
  opencode: [".opencode", "opencode.json"],
  codex: [".codex", ".agents"],
  antigravity: [".agent"],
};

/**
 * Detect which platforms appear to be used in a project directory.
 * Returns a list of platform IDs sorted alphabetically.
 */
export function detectPlatforms(projectRoot: string): PlatformId[] {
  const detected: PlatformId[] = [];

  for (const [id, markers] of Object.entries(DETECTION_MARKERS)) {
    for (const marker of markers) {
      if (existsSync(join(projectRoot, marker))) {
        detected.push(id as PlatformId);
        break;
      }
    }
  }

  // Always check for Claude Code
  if (existsSync(join(projectRoot, "CLAUDE.md")) || existsSync(join(projectRoot, ".claude"))) {
    detected.push("claude-code");
  }

  return detected.sort();
}

/**
 * All adaptable platform IDs (excludes claude-code which uses native plugin).
 */
export const ADAPTABLE_PLATFORMS: Exclude<PlatformId, "claude-code">[] = [
  "cursor",
  "windsurf",
  "copilot",
  "roo-code",
  "opencode",
  "codex",
  "antigravity",
];
