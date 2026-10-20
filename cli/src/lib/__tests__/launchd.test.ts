import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

// The real launchctl must never run: install goes through the injected seam.
vi.mock("../exec.js", () => ({ runWithStderr: vi.fn() }));

import { runWithStderr } from "../exec.js";
import {
  buildPlist,
  install,
  plistPath,
  readProgramArgs,
  validateLabel,
} from "../launchd.js";
import { CliError } from "../output.js";

const LABEL = "com.coding-friend.supervisor-test";

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "cf-launchd-")));
});

afterEach(() => {
  vi.clearAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("launchd plist", () => {
  it("XML-escapes paths with <&\"' (plutil-valid, round-trips)", () => {
    const storeDir = join(root, `st<o&r"e'`);
    const program = join(root, `bin<&"'`, "cf.js");
    const xml = buildPlist({
      label: LABEL,
      programArgs: ["/usr/bin/node", program, "supervisor", "tick"],
      storeDir,
      path: `/usr/bin:/a<b&c"d'e`,
    });
    expect(xml).not.toContain(storeDir);
    expect(xml).not.toContain(program);
    expect(xml).toContain("st&lt;o&amp;r&quot;e&apos;");
    expect(xml).toContain("/a&lt;b&amp;c&quot;d&apos;e");

    const file = join(root, "test.plist");
    writeFileSync(file, xml);
    expect(readProgramArgs(file)).toEqual([
      "/usr/bin/node",
      program,
      "supervisor",
      "tick",
    ]);
    if (process.platform === "darwin") {
      // Throws on a malformed plist.
      execFileSync("/usr/bin/plutil", ["-lint", file], { stdio: "pipe" });
    }
  });

  it("rejects a label that could escape LaunchAgents", () => {
    expect(() => validateLabel("../x")).toThrow(CliError);
    expect(() => plistPath("../x", { launchAgentsDir: root })).toThrow(
      CliError,
    );
    expect(() =>
      buildPlist({ label: "../x", programArgs: [], storeDir: root, path: "" }),
    ).toThrow(CliError);
  });

  it("has the contract keys", () => {
    const storeDir = join(root, "store");
    const xml = buildPlist({
      label: LABEL,
      programArgs: ["/usr/bin/node", "/cf.js", "supervisor", "tick"],
      storeDir,
      path: "/usr/bin:/bin",
    });
    expect(xml).toContain(`<key>Label</key>\n\t<string>${LABEL}</string>`);
    expect(xml).toMatch(
      /<key>ProgramArguments<\/key>\s*<array>[\s\S]*<string>supervisor<\/string>\s*<string>tick<\/string>\s*<\/array>/,
    );
    expect(xml).toContain("<key>StartInterval</key>\n\t<integer>60</integer>");
    expect(xml).toContain("<key>RunAtLoad</key>\n\t<true/>");
    expect(xml).toMatch(
      /<key>EnvironmentVariables<\/key>\s*<dict>\s*<key>PATH<\/key>\s*<string>\/usr\/bin:\/bin<\/string>\s*<key>CF_ORCHESTRATOR_DIR<\/key>\s*<string>[^<]*\/store<\/string>/,
    );
  });
});

describe("launchd install", () => {
  it("writes the plist, then bootout + bootstrap gui/<uid> through the injected launchctl", () => {
    const calls: string[][] = [];
    const agents = join(root, "LaunchAgents");
    const storeDir = join(root, "store");
    const r = install({
      label: LABEL,
      launchAgentsDir: agents,
      uid: 501,
      launchctl: (args) => {
        calls.push(args);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      programArgs: ["/usr/bin/node", "/cf.js", "supervisor", "tick"],
      storeDir,
      path: "/usr/bin:/bin",
    });

    const file = join(agents, `${LABEL}.plist`);
    expect(r.plistPath).toBe(file);
    expect(calls).toEqual([
      ["bootout", `gui/501/${LABEL}`],
      ["bootstrap", "gui/501", file],
    ]);
    expect(runWithStderr).not.toHaveBeenCalled();
    expect(statSync(file).mode & 0o777).toBe(0o644);
    expect(readFileSync(file, "utf-8")).toContain(`<string>${LABEL}</string>`);
    expect(existsSync(join(storeDir, "supervisor"))).toBe(true);
  });
});
