import { describe, it, expect } from "vitest";
import { detectSearchMode, rrfFuse } from "../backends/sqlite/search.js";

describe("detectSearchMode()", () => {
  it("returns 'keyword' for quoted strings", () => {
    expect(detectSearchMode('"exact phrase"')).toBe("keyword");
    expect(detectSearchMode("'single quoted'")).toBe("keyword");
  });

  it("returns 'keyword' for code-like patterns", () => {
    expect(detectSearchMode("auth.middleware")).toBe("keyword");
    expect(detectSearchMode("std::vector")).toBe("keyword");
    expect(detectSearchMode("user->name")).toBe("keyword");
    expect(detectSearchMode("src/lib/auth")).toBe("keyword");
  });

  it("returns 'semantic' for questions", () => {
    expect(detectSearchMode("how does auth work")).toBe("semantic");
    expect(detectSearchMode("What is the login flow")).toBe("semantic");
    expect(detectSearchMode("why did we choose JWT")).toBe("semantic");
    expect(detectSearchMode("where is the config stored")).toBe("semantic");
    expect(detectSearchMode("when was this added")).toBe("semantic");
    expect(detectSearchMode("who implemented this")).toBe("semantic");
    expect(detectSearchMode("is this deprecated")).toBe("semantic");
    expect(detectSearchMode("can we use OAuth")).toBe("semantic");
    expect(detectSearchMode("does this support SSO")).toBe("semantic");
    expect(detectSearchMode("should we migrate")).toBe("semantic");
    expect(detectSearchMode("which database to use")).toBe("semantic");
  });

  it("returns 'hybrid' for general queries", () => {
    expect(detectSearchMode("authentication")).toBe("hybrid");
    expect(detectSearchMode("JWT tokens")).toBe("hybrid");
    expect(detectSearchMode("database migration")).toBe("hybrid");
    expect(detectSearchMode("CORS fix")).toBe("hybrid");
  });

  it("handles edge cases", () => {
    expect(detectSearchMode("  authentication  ")).toBe("hybrid");
    expect(detectSearchMode("How")).toBe("semantic");
  });
});

describe("rrfFuse()", () => {
  it("merges two ranked lists using RRF", () => {
    const list1 = [
      { id: "a", score: 10, matchedOn: ["title"] },
      { id: "b", score: 5, matchedOn: ["content"] },
    ];
    const list2 = [
      { id: "b", score: 0.9, matchedOn: ["semantic"] },
      { id: "c", score: 0.5, matchedOn: ["semantic"] },
    ];

    const fused = rrfFuse(list1, list2);

    // "b" appears in both lists, should have highest RRF score
    expect(fused[0].id).toBe("b");
    expect(fused[0].matchedOn).toContain("content");
    expect(fused[0].matchedOn).toContain("semantic");

    // All three items should be in the result
    expect(fused.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("handles single list", () => {
    const list = [
      { id: "a", score: 10, matchedOn: ["title"] },
      { id: "b", score: 5, matchedOn: ["content"] },
    ];

    const fused = rrfFuse(list);
    expect(fused).toHaveLength(2);
    expect(fused[0].id).toBe("a"); // rank 0 in first list
  });

  it("handles empty lists", () => {
    expect(rrfFuse([], [])).toEqual([]);
    expect(rrfFuse([])).toEqual([]);
  });

  it("handles three lists", () => {
    const list1 = [{ id: "a", score: 10, matchedOn: ["title"] }];
    const list2 = [{ id: "a", score: 0.9, matchedOn: ["semantic"] }];
    const list3 = [{ id: "b", score: 5, matchedOn: ["tags"] }];

    const fused = rrfFuse(list1, list2, list3);

    // "a" appears in 2 lists, should rank higher than "b" in 1 list
    expect(fused[0].id).toBe("a");
    expect(fused[0].score).toBeGreaterThan(fused[1].score);
  });

  it("RRF scores are positive", () => {
    const list = [
      { id: "a", score: 10, matchedOn: ["title"] },
      { id: "b", score: 5, matchedOn: ["content"] },
    ];

    const fused = rrfFuse(list);
    for (const item of fused) {
      expect(item.score).toBeGreaterThan(0);
    }
  });

  it("merges matchedOn from multiple lists", () => {
    const list1 = [{ id: "a", score: 10, matchedOn: ["title", "tags"] }];
    const list2 = [{ id: "a", score: 0.9, matchedOn: ["semantic"] }];

    const fused = rrfFuse(list1, list2);
    expect(fused[0].matchedOn).toContain("title");
    expect(fused[0].matchedOn).toContain("tags");
    expect(fused[0].matchedOn).toContain("semantic");
  });
});
