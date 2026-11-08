import { describe, expect, it } from "vitest";
import { redactText, type SegmentKind } from "../redact.js";
import {
  renderMarkdown,
  truncateChars,
  type Transcript,
} from "../transcript.js";

describe("truncateChars", () => {
  // Cut inside the marker: truncateChars backs off to before it, leaving the
  // key right before the ellipsis. A second redaction pass must not read the
  // ellipsis as a value.
  it.each([
    ["a key=value", "run with token=abcdef0123456789abcdef please"],
    ["a quoted JSON key", '{"password": "hunter2-very-secret-value"}'],
    ["a --password flag", "mysql --password hunter2-very-secret -u root"],
    ["an escaped JSON key", '{\\"password\\":\\"hunter2-very-secret\\"}'],
  ])("a cut after %s is stable under a second redaction pass", (_, raw) => {
    const first = redactText(raw, {});
    const marker = first.text.indexOf("[REDACTED:");
    expect(marker).toBeGreaterThan(0);
    const cut = truncateChars(first.text, marker + 4);
    expect(cut.endsWith("…")).toBe(true);
    expect(redactText(cut, {})).toEqual({ text: cut, counts: {} });
  });

  it("keeps a trailing `word:` before the cut", () => {
    expect(truncateChars("Status: ok", 9)).toBe("Status: …");
  });
});

describe("renderMarkdown", () => {
  it("renderMarkdown gives the filter one kind per segment, in order", async () => {
    const t: Transcript = {
      ref: "claude:fake",
      provider: "claude",
      summary: { title: "T", cwd: "/w" } as Transcript["summary"],
      turns: [
        { kind: "user", text: "hi" },
        { kind: "assistant", text: "yo" },
        { kind: "tool", name: "Bash", args: "ls", output: "out" },
      ],
      skipped: 0,
    };
    let seen: [SegmentKind, string][] = [];
    const r = await renderMarkdown(t, {
      includeToolOutput: true,
      timeoutMs: 1000,
      filter: {
        name: "fake",
        apply: async (s, _signal, meta) => {
          seen = s.map((seg, i) => [meta!.kinds[i], seg]);
          return s.map((seg) => (seg === "yo" ? "" : seg));
        },
      },
    });
    expect(seen).toEqual([
      ["title", "T"],
      ["cwd", "/w"],
      ["user", "hi"],
      ["assistant", "yo"],
      ["toolName", "Bash"],
      ["toolArgs", "ls"],
      ["toolOutput", "out"],
    ]);
    expect(r.filter).toEqual({ name: "fake", status: "applied" });
    expect(r.fullMarkdown).toContain("- filtered: fake, 1 part(s) removed\n");
    expect(r.fullMarkdown).not.toContain("## Assistant");
  });
});
