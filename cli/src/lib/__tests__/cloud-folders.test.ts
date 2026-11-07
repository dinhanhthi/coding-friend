import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { cloudRootOf, detectCloudFolders } from "../cloud-folders.js";

let home: string;

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "cf-cloud-folders-")));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("cloud folders", () => {
  it("treats iCloud app containers as iCloud, not only iCloud Drive", () => {
    const mobile = join(home, "Library", "Mobile Documents");
    const drive = join(mobile, "com~apple~CloudDocs");
    const vault = join(mobile, "iCloud~md~obsidian", "Documents", "notes");
    mkdirSync(drive, { recursive: true });
    mkdirSync(vault, { recursive: true });
    mkdirSync(join(home, "Documents"));

    expect(cloudRootOf(vault, home, "darwin")?.provider).toBe("icloud");
    expect(cloudRootOf(join(drive, "x"), home, "darwin")).toEqual({
      provider: "icloud",
      root: drive,
    });
    expect(cloudRootOf(join(home, "Documents"), home, "darwin")).toBeNull();
    expect(detectCloudFolders(home, "darwin").map((f) => f.root)).toEqual([
      drive,
    ]);
  });

  it("lists a ~/Dropbox symlink to CloudStorage once", () => {
    const dropbox = join(home, "Library", "CloudStorage", "Dropbox");
    mkdirSync(dropbox, { recursive: true });
    symlinkSync(dropbox, join(home, "Dropbox"));

    expect(detectCloudFolders(home, "darwin").map((f) => f.root)).toEqual([
      dropbox,
    ]);
    expect(cloudRootOf(join(home, "Dropbox", "x"), home, "darwin")).toEqual({
      provider: "dropbox",
      root: dropbox,
    });
  });
});
