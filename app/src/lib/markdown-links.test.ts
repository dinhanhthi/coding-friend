import { describe, expect, it } from "vitest";

import { classifyLink } from "./markdown-links";

describe("classifyLink", () => {
  it("never makes javascript: or http: links clickable", () => {
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)//x.md",
      "http://example.com/x.md",
    ]) {
      expect(classifyLink(href, "plans/a.md")).toEqual({ kind: "text" });
    }
    expect(classifyLink("https://example.com/x", "plans/a.md")).toEqual({
      kind: "external",
      url: "https://example.com/x",
    });
  });

  it("resolves a relative .md link inside the tree", () => {
    expect(classifyLink("../memory/b.md#top", "plans/x/a.md")).toEqual({
      kind: "internal",
      path: "plans/memory/b.md",
    });
  });

  it("treats a link escaping the tree root as text", () => {
    expect(classifyLink("../../x.md", "plans/a.md")).toEqual({ kind: "text" });
    expect(classifyLink("%2e%2e/%2e%2e/x.md", "plans/a.md")).toEqual({
      kind: "text",
    });
  });
});
