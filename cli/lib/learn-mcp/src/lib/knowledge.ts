import fs from "node:fs";
import path from "node:path";
import type { KnowledgeEntry, KnowledgeTracking } from "./types.js";
import { getAllDocs } from "./docs.js";

const TRACKING_FILE = ".knowledge-tracking.json";

function trackingPath(docsDir: string): string {
  return path.join(docsDir, TRACKING_FILE);
}

export function readTracking(docsDir: string): KnowledgeTracking {
  const filePath = trackingPath(docsDir);
  if (!fs.existsSync(filePath)) {
    return { version: 1, entries: {} };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return { version: 1, entries: raw.entries ?? {} };
}

export function writeTracking(
  docsDir: string,
  tracking: KnowledgeTracking,
): void {
  fs.writeFileSync(
    trackingPath(docsDir),
    JSON.stringify(tracking, null, 2) + "\n",
    "utf-8",
  );
}

export function trackKnowledge(
  docsDir: string,
  category: string,
  slug: string,
  status: KnowledgeEntry["status"],
  notes?: string,
): KnowledgeEntry {
  const tracking = readTracking(docsDir);
  const key = `${category}/${slug}`;
  const today = new Date().toISOString().split("T")[0]!;
  const existing = tracking.entries[key];

  const entry: KnowledgeEntry = {
    status,
    lastReviewed: today,
    reviewCount: (existing?.reviewCount ?? 0) + 1,
    notes: notes ?? existing?.notes ?? "",
    firstSeen: existing?.firstSeen ?? today,
  };

  tracking.entries[key] = entry;
  writeTracking(docsDir, tracking);
  return entry;
}

export function getReviewList(
  docsDir: string,
  statusFilter?: "needs-review" | "new",
  limit?: number,
): Array<{ key: string; entry: KnowledgeEntry }> {
  const tracking = readTracking(docsDir);
  const allDocs = getAllDocs(docsDir);

  const results: Array<{ key: string; entry: KnowledgeEntry }> = [];

  for (const doc of allDocs) {
    const key = `${doc.category}/${doc.slug}`;
    const entry = tracking.entries[key] ?? {
      status: "new" as const,
      lastReviewed: null,
      reviewCount: 0,
      notes: "",
      firstSeen: doc.frontmatter.created || new Date().toISOString().split("T")[0]!,
    };

    if (statusFilter && entry.status !== statusFilter) continue;
    if (!statusFilter && entry.status === "remembered") continue;

    results.push({ key, entry });
  }

  results.sort((a, b) => {
    if (a.entry.status === "needs-review" && b.entry.status !== "needs-review")
      return -1;
    if (a.entry.status !== "needs-review" && b.entry.status === "needs-review")
      return 1;

    const dateA = a.entry.lastReviewed ?? a.entry.firstSeen;
    const dateB = b.entry.lastReviewed ?? b.entry.firstSeen;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  return limit ? results.slice(0, limit) : results;
}
