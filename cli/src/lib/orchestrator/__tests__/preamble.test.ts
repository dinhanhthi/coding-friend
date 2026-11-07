import { describe, it, expect } from "vitest";
import { buildPreamble } from "../preamble.js";

describe("buildPreamble", () => {
  it("no-shell asks for a Handoff section in the final message, not a handoff.md write", () => {
    const text = buildPreamble({
      taskId: "abcd1234",
      readOnly: true,
      cfInvocation: ["/usr/bin/node", "/x/cli/index.js"],
      orchDir: "/store",
      cfShell: false,
    });
    expect(text).toContain('"Handoff" section');
    expect(text).not.toContain("handoff.md");
    expect(text).not.toContain("/store");
  });
});
