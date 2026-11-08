// Redaction pipeline for session export (B2). Patterns come from the secret
// table in docs/context/2026-11-04-sessions-sync-b2-research.md.
//
// Invariant: a `[REDACTED:<kind>]` marker never re-matches any pattern, so a
// second `redactText` pass over its own output always counts 0. Free-value
// groups (generic value, Bearer token, URL userinfo, webhook path) start with
// `(?!\[REDACTED:)`; fixed-prefix vendor patterns cannot match a marker. A
// generic value also never starts with the truncation ellipsis `…`, so a cut
// that leaves `key=…` is not redacted again.

const NOT_MARKER = String.raw`(?!\[REDACTED:)`;
const NOT_MARKER_OR_CUT = String.raw`(?!\[REDACTED:|…)`;
// Not preceded by a letter or digit. Unlike `\b`, `_` counts as a boundary, so
// `my_sk_live_…` is still caught while `task-…` is not taken for `sk-…`.
const START = String.raw`(?<![A-Za-z0-9])`;

interface Rule {
  kind: string;
  re: RegExp;
  // Every captured group (prefix, opening quote) is kept verbatim before the
  // marker.
  keepPrefix?: boolean;
}

// Order matters: PEM first (its body can hold anything), Anthropic before the
// generic OpenAI `sk-` rule, specific tokens before the generic key=value rule.
const RULES: Rule[] = [
  {
    kind: "pem",
    re: /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY( BLOCK)?-----[\s\S]*?(?:-----END[ A-Z0-9_-]{0,100}PRIVATE KEY( BLOCK)?-----|$)/g,
  },
  {
    kind: "anthropic",
    re: new RegExp(
      START + String.raw`sk-ant-[a-z]+\d*-[A-Za-z0-9_-]{20,}`,
      "g",
    ),
  },
  {
    kind: "openai",
    re: new RegExp(
      START + String.raw`sk-(?:(?:proj|svcacct|admin)-)?[A-Za-z0-9_-]{20,}`,
      "g",
    ),
  },
  {
    kind: "github",
    re: /gh[pousr]_[0-9A-Za-z]{36,}|github_pat_\w{82,}/g,
  },
  {
    kind: "aws",
    re: new RegExp(
      START + String.raw`(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}`,
      "g",
    ),
  },
  {
    kind: "slack-webhook",
    re: new RegExp(
      String.raw`hooks\.slack\.com/(?:services|workflows|triggers)/` +
        NOT_MARKER +
        String.raw`[A-Za-z0-9+/_-]+`,
      "g",
    ),
  },
  {
    kind: "slack",
    re: /x(?:ox[abposre]|app|wfp)[.-][A-Za-z0-9.-]{10,}/g,
  },
  { kind: "google", re: /AIza[\w-]{35}/g },
  {
    kind: "stripe",
    re: new RegExp(
      START + String.raw`(?:sk|rk)_(?:test|live|prod)_[A-Za-z0-9]{10,99}`,
      "g",
    ),
  },
  {
    kind: "jwt",
    re: /ey[A-Za-z0-9]{17,}\.ey[A-Za-z0-9/\\_-]{17,}\.(?:[A-Za-z0-9/\\_-]{10,}={0,2})?/g,
  },
  {
    kind: "bearer",
    re: new RegExp(
      String.raw`(\bBearer\s+)` +
        NOT_MARKER +
        String.raw`[A-Za-z0-9._~+/=-]{8,}`,
      "gi",
    ),
    keepPrefix: true,
  },
  {
    // Only after an Authorization header (also as a JSON key), so prose such
    // as "Basic authentication" is left alone.
    kind: "basic",
    re: new RegExp(
      String.raw`(\bAuthorization(?:\\?["'])?\s*[:=]\s*(?:\\?["'])?Basic\s+)` +
        NOT_MARKER +
        String.raw`[A-Za-z0-9+/=]{8,}`,
      "gi",
    ),
    keepPrefix: true,
  },
  {
    kind: "url-userinfo",
    re: new RegExp(
      String.raw`(\b[a-z][a-z0-9+.-]*://)` +
        NOT_MARKER +
        String.raw`[^\s:/@]*:[^\s/@]+(?=@)`,
      "gi",
    ),
    keepPrefix: true,
  },
  {
    // Case-insensitive so `DB_PASSWORD=` and `API_KEY=` match; the optional
    // quote after the key matches serialized JSON (`"password":"…"`), also
    // when nested and escaped (`\"password\":\"…\"`). Only the value is
    // replaced: a quoted value up to its closing quote (spaces allowed, any
    // length), otherwise up to whitespace, a quote or `,;&}`. A `--password`
    // style flag also takes its value after spaces or tabs on the same line.
    kind: "generic",
    re: new RegExp(
      String.raw`((?:secret_key_base|passphrase|key|secret|token|password|passwd|pwd|api_key)(?:\\?['"])?\s*[:=]\s*|--(?:password|passwd|pwd|passphrase|secret|token|api-key|api_key)[ \t]+)` +
        "(?:" +
        [
          String.raw`(\\")` +
            NOT_MARKER_OR_CUT +
            String.raw`(?:(?!\\")[^\r\n])+`,
          `(")` + NOT_MARKER_OR_CUT + String.raw`(?:[^"\\\r\n]|\\.)+`,
          `(')` + NOT_MARKER_OR_CUT + String.raw`(?:[^'\\\r\n]|\\.)+`,
          String.raw`(?!\\?["'])` +
            NOT_MARKER_OR_CUT +
            String.raw`[^\s'",;&}]+`,
        ].join("|") +
        ")",
      "gi",
    ),
    keepPrefix: true,
  },
];

export interface RedactResult {
  text: string;
  counts: Record<string, number>;
}

function bump(counts: Record<string, number>, kind: string): void {
  counts[kind] = (counts[kind] ?? 0) + 1;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Redact secrets in `s`, then replace the home dir with `~`. */
export function redactText(s: string, opts: { home?: string }): RedactResult {
  const counts: Record<string, number> = {};
  let text = s;
  for (const rule of RULES) {
    text = text.replace(rule.re, (...args: unknown[]) => {
      bump(counts, rule.kind);
      // args = [match, ...groups, offset, input]; undefined groups are skipped.
      const keep = rule.keepPrefix
        ? args
            .slice(1, -2)
            .filter((g) => typeof g === "string")
            .join("")
        : "";
      return `${keep}[REDACTED:${rule.kind}]`;
    });
  }
  const home = opts.home?.replace(/[\\/]+$/, "");
  if (home) {
    // Only whole path components: `/Users/a` must not eat `/Users/ab`.
    const re = new RegExp(escapeRegExp(home) + "(?![A-Za-z0-9_.-])", "g");
    text = text.replace(re, () => {
      bump(counts, "home");
      return "~";
    });
  }
  return { text, counts };
}

/** True when `out` can be obtained from `input` by deleting characters. O(n+m). */
export function isCharSubsequence(out: string, input: string): boolean {
  let i = 0;
  for (let j = 0; i < out.length && j < input.length; j++) {
    if (out.charCodeAt(i) === input.charCodeAt(j)) i++;
  }
  return i === out.length;
}

export type SegmentKind =
  | "title"
  | "cwd"
  | "user"
  | "assistant"
  | "toolName"
  | "toolArgs"
  | "toolOutput";

export interface ExtraFilter {
  name: string;
  /** `meta.kinds[i]` is the kind of `segments[i]`. */
  apply(
    segments: string[],
    signal: AbortSignal,
    meta?: { kinds: SegmentKind[] },
  ): Promise<string[]>;
}

export type FilterStatus =
  | "none"
  | "applied"
  | "rejected"
  | "error"
  | "timeout";

export interface ExportPipelineResult {
  segments: string[];
  counts: Record<string, number>;
  filter: { name: string | null; status: FilterStatus };
}

const TIMEOUT = Symbol("timeout");

async function runFilter(
  filter: ExtraFilter,
  input: string[],
  timeoutMs: number,
  meta?: { kinds: SegmentKind[] },
): Promise<{ segments: string[] | null; status: FilterStatus }> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The filter gets a copy, so mutating it can never touch the fail-safe.
  const pending = Promise.resolve().then(() =>
    filter.apply([...input], ac.signal, meta),
  );
  pending.catch(() => {});
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });
  try {
    const out = await Promise.race([pending, timeout]);
    if (out === TIMEOUT) {
      ac.abort();
      return { segments: null, status: "timeout" };
    }
    const valid =
      Array.isArray(out) &&
      out.length === input.length &&
      out.every(
        (seg, i) => typeof seg === "string" && isCharSubsequence(seg, input[i]),
      );
    return valid
      ? { segments: out, status: "applied" }
      : { segments: null, status: "rejected" };
  } catch {
    return { segments: null, status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Steps 1-3 of the export pipeline: regex redaction on every segment (always),
 * then an optional extra filter whose output must be a per-segment character
 * subsequence of the regex result. Any filter failure falls back to the regex
 * result. Truncation and Markdown assembly happen in the caller.
 */
export async function runExportPipeline(
  segments: string[],
  opts: {
    filter?: ExtraFilter;
    timeoutMs: number;
    home?: string;
    kinds?: SegmentKind[];
  },
): Promise<ExportPipelineResult> {
  const results = segments.map((seg) => redactText(seg, { home: opts.home }));
  const redacted = results.map((r) => r.text);
  // Counts only parts that stay in the output: a part the filter emptied
  // shows none of its redactions.
  const countKept = (out: string[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    results.forEach((r, i) => {
      if (out[i] === "" && redacted[i] !== "") return;
      for (const [kind, n] of Object.entries(r.counts)) {
        counts[kind] = (counts[kind] ?? 0) + n;
      }
    });
    return counts;
  };
  if (!opts.filter) {
    return {
      segments: redacted,
      counts: countKept(redacted),
      filter: { name: null, status: "none" },
    };
  }
  const { segments: filtered, status } = await runFilter(
    opts.filter,
    redacted,
    opts.timeoutMs,
    opts.kinds && { kinds: opts.kinds },
  );
  const out = filtered ?? redacted;
  return {
    segments: out,
    counts: countKept(out),
    filter: { name: opts.filter.name, status },
  };
}
