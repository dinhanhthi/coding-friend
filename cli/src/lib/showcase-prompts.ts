/**
 * Shared showcase prompt helpers — saved `/cf-showcase --default` answers.
 */
import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { readJson, mergeJson } from "./json.js";
import { log } from "./log.js";
import { SHOWCASE_POSTER_SIZE_RE } from "./config.js";
import { globalConfigPath, localConfigPath } from "./paths.js";
import type {
  CodingFriendConfig,
  ShowcasePosterConfig,
  ShowcaseVideoConfig,
} from "../types.js";
import { BACK, injectBackChoice, askScope } from "./prompt-utils.js";

type ShowcaseMode = "video" | "poster";

export const SHOWCASE_BUILTINS = {
  video: { length: "auto", aspect: "16:9", audio: true },
  poster: { size: "1200x630", formats: ["png"] },
} satisfies {
  video: Omit<Required<ShowcaseVideoConfig>, "languages">;
  poster: Omit<Required<ShowcasePosterConfig>, "languages">;
};

// ─── Merge / write helpers ───────────────────────────────────────────

export function getShowcaseDefaults(
  mode: "video",
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Required<ShowcaseVideoConfig>;
export function getShowcaseDefaults(
  mode: "poster",
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Required<ShowcasePosterConfig>;
export function getShowcaseDefaults(
  mode: ShowcaseMode,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Required<ShowcaseVideoConfig> | Required<ShowcasePosterConfig>;
export function getShowcaseDefaults(
  mode: ShowcaseMode,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Required<ShowcaseVideoConfig> | Required<ShowcasePosterConfig> {
  const merged: Record<string, unknown> = {
    ...SHOWCASE_BUILTINS[mode],
    ...globalCfg?.showcase?.[mode],
    ...localCfg?.showcase?.[mode],
  };
  if (merged.languages === undefined) {
    merged.languages = [localCfg?.language ?? globalCfg?.language ?? "en"];
  }
  return merged as
    | Required<ShowcaseVideoConfig>
    | Required<ShowcasePosterConfig>;
}

export function writeShowcaseField(
  scope: "global" | "local",
  mode: ShowcaseMode,
  field: string,
  value: unknown,
): void {
  const targetPath =
    scope === "global" ? globalConfigPath() : localConfigPath();
  const existing = readJson<CodingFriendConfig>(targetPath);
  mergeJson(targetPath, {
    showcase: {
      ...existing?.showcase,
      [mode]: { ...existing?.showcase?.[mode], [field]: value },
    },
  });
  log.success(`Saved to ${targetPath}`);
}

// ─── Field editors (return BACK to cancel) ───────────────────────────

async function editVideoLength(): Promise<unknown> {
  const choice = await select({
    message: "Video length:",
    choices: injectBackChoice([
      { name: "auto — let the agent decide", value: "auto" },
      { name: "30 seconds", value: "30" },
      { name: "Custom…", value: "custom" },
    ]),
  });
  if (choice === BACK) return BACK;
  if (choice === "auto") return "auto";
  if (choice === "30") return 30;
  const answer = await input({
    message: "Length in seconds:",
    validate: (v) =>
      /^\d+$/.test(v.trim()) && Number(v) >= 1
        ? true
        : "Enter a whole number of seconds (at least 1)",
  });
  return Number(answer.trim());
}

async function editVideoAspect(): Promise<unknown> {
  return select({
    message: "Video aspect ratio:",
    choices: injectBackChoice([
      { name: "16:9", value: "16:9" },
      { name: "1:1", value: "1:1" },
      { name: "9:16", value: "9:16" },
    ]),
  });
}

async function editVideoAudio(current: boolean): Promise<unknown> {
  return confirm({ message: "Include audio?", default: current });
}

async function editPosterSize(): Promise<unknown> {
  const choice = await select({
    message: "Poster size:",
    choices: injectBackChoice([
      { name: "1200x630", value: "1200x630" },
      { name: "A4", value: "A4" },
      { name: "1080x1080", value: "1080x1080" },
      { name: "1080x1920", value: "1080x1920" },
      { name: "Custom…", value: "custom" },
    ]),
  });
  if (choice !== "custom") return choice;
  const answer = await input({
    message: "Poster size (A4, A3, letter, or <width>x<height>):",
    validate: (v) =>
      SHOWCASE_POSTER_SIZE_RE.test(v.trim())
        ? true
        : "Use A4, A3, letter, or <width>x<height> (e.g. 1600x900)",
  });
  return answer.trim();
}

async function editPosterFormats(current: string[]): Promise<unknown> {
  return checkbox({
    message: "Poster formats:",
    choices: ["png", "pdf", "html"].map((f) => ({
      name: f,
      value: f,
      checked: current.includes(f),
    })),
    validate: (items) =>
      items.length > 0 ? true : "Select at least one format",
  });
}

function parseLanguages(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function editLanguages(current: string[]): Promise<unknown> {
  const answer = await input({
    message: "Languages (comma-separated):",
    default: current.join(", "),
    validate: (v) =>
      parseLanguages(v).length > 0 ? true : "Enter at least one language",
  });
  return parseLanguages(answer);
}

async function editShowcaseField(
  mode: ShowcaseMode,
  field: string,
  current: Record<string, unknown>,
): Promise<unknown> {
  if (field === "languages") {
    return editLanguages(current.languages as string[]);
  }
  if (mode === "video") {
    if (field === "length") return editVideoLength();
    if (field === "aspect") return editVideoAspect();
    return editVideoAudio(current.audio as boolean);
  }
  if (field === "size") return editPosterSize();
  return editPosterFormats(current.formats as string[]);
}

// ─── Menus ───────────────────────────────────────────────────────────

const FIELDS: Record<ShowcaseMode, Array<{ field: string; label: string }>> = {
  video: [
    { field: "length", label: "Length" },
    { field: "aspect", label: "Aspect" },
    { field: "audio", label: "Audio" },
    { field: "languages", label: "Languages" },
  ],
  poster: [
    { field: "size", label: "Size" },
    { field: "formats", label: "Formats" },
    { field: "languages", label: "Languages" },
  ],
};

function formatValue(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

async function showcaseModeMenu(mode: ShowcaseMode): Promise<void> {
  while (true) {
    const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
    const localCfg = readJson<CodingFriendConfig>(localConfigPath());
    const current = getShowcaseDefaults(mode, globalCfg, localCfg) as Record<
      string,
      unknown
    >;

    const field = await select({
      message: `${mode === "video" ? "Video" : "Poster"} defaults:`,
      choices: injectBackChoice(
        FIELDS[mode].map(({ field, label }) => ({
          name: `${label} (${formatValue(current[field])})`,
          value: field,
        })),
      ),
    });
    if (field === BACK) return;

    const value = await editShowcaseField(mode, field, current);
    if (value === BACK) continue;

    const scope = await askScope();
    if (scope === "back") continue;
    writeShowcaseField(scope, mode, field, value);
  }
}

export async function showcaseConfigMenu(opts?: {
  exitLabel?: string;
}): Promise<void> {
  log.dim("These are the values `/cf-showcase --default` uses.");
  while (true) {
    const choice = await select({
      message: "Showcase settings:",
      choices: injectBackChoice(
        [
          { name: "Video defaults", value: "video" as const },
          { name: "Poster defaults", value: "poster" as const },
        ],
        opts?.exitLabel ?? "Back",
      ),
    });
    if (choice === BACK) return;
    await showcaseModeMenu(choice);
  }
}
