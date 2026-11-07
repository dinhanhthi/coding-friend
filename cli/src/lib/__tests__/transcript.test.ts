import { describe, expect, it } from "vitest";
import { redactText } from "../redact.js";
import { truncateChars } from "../transcript.js";

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
