/**
 * Hybrid search: FTS5 BM25 + sqlite-vec cosine similarity + RRF fusion.
 *
 * Query routing:
 * - Quoted strings or code patterns → keyword only (FTS5)
 * - Questions (starts with who/what/why/how/when/where) → semantic only (vector)
 * - Default → hybrid (FTS5 + vector, fused with RRF)
 */

import type { DatabaseLike } from "./migrations.js";
import {
  EmbeddingPipeline,
  EmbeddingCache,
  contentHash,
  prepareEmbeddingText,
} from "./embeddings.js";
import { EMBEDDING_DIMS } from "./schema.js";
import { applyTemporalDecay } from "../../lib/temporal-decay.js";

/** RRF fusion constant — higher = more weight to individual rankings */
const RRF_K = 60;

export type SearchMode = "keyword" | "semantic" | "hybrid";

interface RankedResult {
  id: string;
  score: number;
  matchedOn: string[];
}

/**
 * Detect the best search mode based on query shape.
 */
export function detectSearchMode(query: string): SearchMode {
  const trimmed = query.trim();

  // Quoted strings → keyword
  if (/^["'].*["']$/.test(trimmed)) return "keyword";

  // Code-like patterns (dotted identifiers, ::, ->, path separators) → keyword
  if (/\w\.\w|->|::|\/\w+\//.test(trimmed)) return "keyword";

  // Questions → semantic
  if (
    /^(who|what|why|how|when|where|is|are|can|does|do|should|which)\b/i.test(
      trimmed,
    )
  ) {
    return "semantic";
  }

  return "hybrid";
}

/**
 * FTS5 keyword search using BM25 ranking.
 */
export function ftsSearch(
  db: DatabaseLike,
  query: string,
  limit: number,
  typeFilter?: string,
): RankedResult[] {
  // Escape FTS5 special characters and wrap tokens in quotes to prevent
  // FTS5 operator injection (AND, OR, NOT, NEAR, column: filters)
  const cleaned = query.replace(/['"*()]/g, " ").trim();
  if (!cleaned) return [];
  const escaped = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t}"`)
    .join(" ");

  // Build FTS5 query with column weights
  // BM25 weights: title(10), description(4), tags(6), content(1)
  let sql = `
    SELECT
      m.id,
      m.updated,
      bm25(memories_fts, 10.0, 4.0, 6.0, 1.0) AS rank,
      memories_fts.title AS fts_title,
      memories_fts.description AS fts_desc,
      memories_fts.tags AS fts_tags,
      memories_fts.content AS fts_content
    FROM memories_fts
    JOIN memories m ON m.rowid = memories_fts.rowid
    WHERE memories_fts MATCH ?
  `;

  const params: unknown[] = [escaped];

  if (typeFilter) {
    sql += ` AND m.type = ?`;
    params.push(typeFilter);
  }

  sql += ` ORDER BY rank LIMIT ?`;
  params.push(limit);

  try {
    const stmt = db.prepare(sql);
    const results: RankedResult[] = [];
    const allRows = (
      stmt as unknown as {
        all(...p: unknown[]): Array<Record<string, unknown>>;
      }
    ).all(...params);

    for (const row of allRows) {
      const matchedOn: string[] = [];
      const q = escaped.toLowerCase();
      if (
        String(row.fts_title ?? "")
          .toLowerCase()
          .includes(q)
      )
        matchedOn.push("title");
      if (
        String(row.fts_desc ?? "")
          .toLowerCase()
          .includes(q)
      )
        matchedOn.push("description");
      if (
        String(row.fts_tags ?? "")
          .toLowerCase()
          .includes(q)
      )
        matchedOn.push("tags");
      if (
        matchedOn.length === 0 &&
        String(row.fts_content ?? "")
          .toLowerCase()
          .includes(q)
      ) {
        matchedOn.push("content");
      }
      if (matchedOn.length === 0) matchedOn.push("content");

      const rawScore = -(row.rank as number);
      const decayedScore = applyTemporalDecay(rawScore, String(row.updated));

      results.push({
        id: String(row.id),
        score: decayedScore,
        matchedOn,
      });
    }

    return results;
  } catch {
    // FTS5 query syntax error — return empty
    return [];
  }
}

/**
 * Vector similarity search using sqlite-vec cosine distance.
 */
export async function vecSearch(
  db: DatabaseLike,
  query: string,
  limit: number,
  pipeline: EmbeddingPipeline,
  typeFilter?: string,
): Promise<RankedResult[]> {
  const embedding = await pipeline.embed(query);
  const buffer = Buffer.from(
    embedding.buffer,
    embedding.byteOffset,
    embedding.byteLength,
  );

  try {
    let sql: string;
    let params: unknown[];

    if (typeFilter) {
      sql = `
        SELECT
          v.memory_id AS id,
          v.distance,
          m.updated
        FROM vec_memories v
        JOIN memories m ON m.id = v.memory_id
        WHERE v.embedding MATCH ? AND k = ? AND m.type = ?
        ORDER BY v.distance
      `;
      params = [buffer, limit, typeFilter];
    } else {
      sql = `
        SELECT
          v.memory_id AS id,
          v.distance,
          m.updated
        FROM vec_memories v
        JOIN memories m ON m.id = v.memory_id
        WHERE v.embedding MATCH ? AND k = ?
        ORDER BY v.distance
      `;
      params = [buffer, limit];
    }

    const stmt = db.prepare(sql);
    const rows = (
      stmt as unknown as {
        all(...p: unknown[]): Array<Record<string, unknown>>;
      }
    ).all(...params);

    return rows.map((row) => {
      const rawScore = 1 - (row.distance as number);
      return {
        id: String(row.id),
        score: applyTemporalDecay(rawScore, String(row.updated)),
        matchedOn: ["semantic"],
      };
    });
  } catch {
    // sqlite-vec not available or query failed
    return [];
  }
}

/**
 * Reciprocal Rank Fusion (RRF) — merge two ranked lists.
 *
 * For each document, RRF score = sum over all lists of: 1 / (k + rank_in_list)
 * where k is a constant (default 60) that controls how much individual rank matters.
 */
export function rrfFuse(...lists: RankedResult[][]): RankedResult[] {
  const scores = new Map<string, { score: number; matchedOn: Set<string> }>();

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const existing = scores.get(item.id) ?? {
        score: 0,
        matchedOn: new Set<string>(),
      };
      existing.score += 1 / (RRF_K + rank + 1);
      for (const m of item.matchedOn) {
        existing.matchedOn.add(m);
      }
      scores.set(item.id, existing);
    }
  }

  return Array.from(scores.entries())
    .map(([id, { score, matchedOn }]) => ({
      id,
      score,
      matchedOn: Array.from(matchedOn),
    }))
    .sort((a, b) => b.score - a.score);
}

export interface HybridSearchOptions {
  db: DatabaseLike;
  query: string;
  limit: number;
  pipeline: EmbeddingPipeline | null;
  vecEnabled: boolean;
  typeFilter?: string;
  modeOverride?: SearchMode;
}

/**
 * Perform a hybrid search combining FTS5 and vector similarity.
 */
export async function hybridSearch(
  opts: HybridSearchOptions,
): Promise<RankedResult[]> {
  const { db, query, limit, pipeline, vecEnabled, typeFilter, modeOverride } =
    opts;
  const mode = modeOverride ?? detectSearchMode(query);

  // Fetch more results than needed for fusion, then trim
  const fetchLimit = Math.max(limit * 3, 20);

  if (mode === "keyword" || !vecEnabled || !pipeline) {
    return ftsSearch(db, query, limit, typeFilter);
  }

  if (mode === "semantic") {
    return vecSearch(db, query, limit, pipeline, typeFilter);
  }

  // Hybrid: run both in parallel, fuse with RRF
  const [ftsResults, vecResults] = await Promise.all([
    ftsSearch(db, query, fetchLimit, typeFilter),
    vecSearch(db, query, fetchLimit, pipeline, typeFilter),
  ]);

  const fused = rrfFuse(ftsResults, vecResults);
  return fused.slice(0, limit);
}
