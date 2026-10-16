import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

vi.mock("../paths.js", () => ({
  localConfigPath: vi.fn(),
  globalConfigPath: vi.fn(),
}));

vi.mock("../log.js", () => ({
  log: {
    success: vi.fn(),
    warn: vi.fn(),
    dim: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  checkbox: vi.fn(),
  Separator: class Separator {},
}));

import * as paths from "../paths.js";
import { select } from "@inquirer/prompts";
import { BACK } from "../prompt-utils.js";
import {
  getShowcaseDefaults,
  showcaseConfigMenu,
  writeShowcaseField,
} from "../showcase-prompts.js";

const localConfigPathMock = paths.localConfigPath as unknown as MockInstance;
const globalConfigPathMock = paths.globalConfigPath as unknown as MockInstance;
const mockSelect = vi.mocked(select);

let testDir: string;
let localConfigFile: string;
let globalConfigFile: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "cf-showcase-test-"));
  localConfigFile = join(testDir, "local", "config.json");
  globalConfigFile = join(testDir, "global", "config.json");
  localConfigPathMock.mockReturnValue(localConfigFile);
  globalConfigPathMock.mockReturnValue(globalConfigFile);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function readConfig(file: string) {
  return JSON.parse(readFileSync(file, "utf-8"));
}

describe("getShowcaseDefaults", () => {
  it("returns built-in fallbacks when nothing is set", () => {
    expect(getShowcaseDefaults("video", null, null)).toEqual({
      length: "auto",
      aspect: "16:9",
      audio: true,
      languages: ["en"],
    });
    expect(getShowcaseDefaults("poster", null, null)).toEqual({
      size: "1200x630",
      formats: ["png"],
      languages: ["en"],
    });
  });

  it("uses global values when only global is set", () => {
    const global = { showcase: { video: { length: 45, audio: false } } };
    expect(getShowcaseDefaults("video", global, null)).toEqual({
      length: 45,
      aspect: "16:9",
      audio: false,
      languages: ["en"],
    });
  });

  it("lets local override global per field and keeps other global fields", () => {
    const global = {
      showcase: { poster: { size: "A4", formats: ["pdf" as const] } },
    };
    const local = { showcase: { poster: { size: "1080x1080" } } };
    expect(getShowcaseDefaults("poster", global, local)).toEqual({
      size: "1080x1080",
      formats: ["pdf"],
      languages: ["en"],
    });
  });

  it("falls back languages to the configured language, local winning", () => {
    expect(
      getShowcaseDefaults("video", { language: "fr" }, { language: "vi" })
        .languages,
    ).toEqual(["vi"]);
    expect(
      getShowcaseDefaults("video", { language: "fr" }, null).languages,
    ).toEqual(["fr"]);
    expect(
      getShowcaseDefaults(
        "video",
        { showcase: { video: { languages: ["de", "en"] } } },
        { language: "vi" },
      ).languages,
    ).toEqual(["de", "en"]);
  });
});

describe("writeShowcaseField", () => {
  it("preserves the sibling mode, other fields, and other top-level keys", () => {
    mkdirSync(join(testDir, "global"), { recursive: true });
    writeFileSync(
      globalConfigFile,
      JSON.stringify({
        language: "fr",
        showcase: { poster: { size: "A4" }, video: { length: 30 } },
      }),
      "utf-8",
    );

    writeShowcaseField("global", "video", "aspect", "9:16");

    expect(readConfig(globalConfigFile)).toEqual({
      language: "fr",
      showcase: {
        poster: { size: "A4" },
        video: { length: 30, aspect: "9:16" },
      },
    });
  });
});

describe("showcaseConfigMenu", () => {
  it("writes showcase.video.aspect to the chosen scope", async () => {
    mockSelect
      .mockResolvedValueOnce("video" as never)
      .mockResolvedValueOnce("aspect" as never)
      .mockResolvedValueOnce("9:16" as never)
      .mockResolvedValueOnce("local" as never)
      .mockResolvedValueOnce(BACK as never)
      .mockResolvedValueOnce(BACK as never);

    await showcaseConfigMenu();

    expect(readConfig(localConfigFile)).toEqual({
      showcase: { video: { aspect: "9:16" } },
    });
    expect(existsSync(globalConfigFile)).toBe(false);
  });

  it("writes nothing when back is chosen at the scope prompt", async () => {
    mockSelect
      .mockResolvedValueOnce("video" as never)
      .mockResolvedValueOnce("aspect" as never)
      .mockResolvedValueOnce("9:16" as never)
      .mockResolvedValueOnce("back" as never)
      .mockResolvedValueOnce(BACK as never)
      .mockResolvedValueOnce(BACK as never);

    await showcaseConfigMenu();

    expect(existsSync(localConfigFile)).toBe(false);
    expect(existsSync(globalConfigFile)).toBe(false);
  });
});
