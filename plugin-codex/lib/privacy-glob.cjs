"use strict";
// privacy-glob.cjs — the glob-vs-name matcher shared by privacy-block.sh
// (Grep globs, Glob patterns) and privacy-block.agy.sh (run_command words, path-tool globs).
// Both hooks load it with `node -e <script> <this file>`; the patterns come
// from privacy-patterns.sh through the CF_PRIVACY_* env vars that
// privacy_export_env sets.

// grep -E (ERE) to JS: map POSIX bracket classes; an unknown one throws.
const POSIX = {
  alnum: "A-Za-z0-9",
  alpha: "A-Za-z",
  digit: "0-9",
  lower: "a-z",
  upper: "A-Z",
  xdigit: "0-9A-Fa-f",
  space: " \\t\\n\\r\\f\\v",
  blank: " \\t",
};
function ere(src) {
  const js = src.replace(/\[:([a-z]+):\]/g, (m, name) => {
    if (!POSIX[name]) throw new Error("unsupported class " + m);
    return POSIX[name];
  });
  return new RegExp(js, "i");
}
const list = (E, k) => String(E[k] || "").split("\n").filter(Boolean);
function one(E, k) {
  if (!E[k]) throw new Error("missing " + k);
  return ere(E[k]);
}

// A word is a list of {c, q}: q 0 = unquoted, else quoted or escaped. Only
// unquoted * ? [ are glob syntax.
const text = (w) => w.map((x) => x.c).join("");
const isGlob = (x) => x.q === 0 && (x.c === "*" || x.c === "?" || x.c === "[");

// lexGlob(str) — a tool glob (ripgrep -g, find_by_name Pattern) as a word: a
// backslash takes the next character as a literal (\e is e); a trailing
// backslash stays a literal backslash.
function lexGlob(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\\" && i + 1 < str.length) out.push({ c: str[++i], q: 1 });
    else out.push({ c: str[i], q: str[i] === "\\" ? 1 : 0 });
  }
  return out;
}

// Glob character classes ([[:alpha:]]). Letters fold case below, so lower
// and upper are any letter.
const CLASSES = {
  alnum: /[a-z0-9]/i,
  alpha: /[a-z]/i,
  blank: /[ \t]/,
  cntrl: /[\x00-\x1f\x7f]/,
  digit: /[0-9]/,
  graph: /[!-~]/,
  lower: /[a-z]/i,
  print: /[ -~]/,
  punct: /[!-/:-@[-`{-~]/,
  space: /\s/,
  upper: /[a-z]/i,
  word: /\w/,
  xdigit: /[0-9a-f]/i,
};

// unitEnd(chars, i) — when chars[i] opens a [:name:], [=c=] or [.c.] unit,
// the index just past its closing "]", else -1.
function unitEnd(chars, i) {
  const d = chars[i + 1];
  if (chars[i] !== "[" || (d !== ":" && d !== "=" && d !== ".")) return -1;
  for (let e = i + 2; e + 1 < chars.length; e++) {
    if (chars[e] === d && chars[e + 1] === "]") return e + 2;
  }
  return -1;
}

// classTest(body, neg) — a test for one character against the class body
// (the text between "[" or "[!" and "]"). Unknown names, [=c=] and [.c.]
// match anything (fail closed). Each character is tried in both cases; a
// negated class matches when either case is outside it.
function classTest(body, neg) {
  const parts = [];
  for (let i = 0; i < body.length; i++) {
    const end = unitEnd(body, i);
    if (end > 0) {
      const re = body[i + 1] === ":" ? CLASSES[body.slice(i + 2, end - 2)] : null;
      if (!re) return () => true;
      parts.push((ch) => re.test(ch));
      i = end - 1;
    } else if (body[i + 1] === "-" && i + 2 < body.length) {
      const a = body[i];
      const b = body[i + 2];
      parts.push((ch) => ch >= a && ch <= b);
      i += 2;
    } else {
      const a = body[i];
      parts.push((ch) => ch === a);
    }
  }
  const has = (x) => parts.some((f) => f(x));
  return (ch) => {
    const cases = [ch.toLowerCase(), ch.toUpperCase()];
    return neg ? cases.some((x) => !has(x)) : cases.some(has);
  };
}

// globTokens(seg) — "*", "?", a class {k:"[", test}, or a literal {k:"c", c}.
// A [:name:] unit inside a class does not close it.
function globTokens(seg) {
  const chars = seg.map((x) => x.c);
  const out = [];
  for (let i = 0; i < seg.length; i++) {
    const x = seg[i];
    if (x.q === 0 && x.c === "*") {
      if (!out.length || out[out.length - 1].k !== "*") out.push({ k: "*" });
      continue;
    }
    if (x.q === 0 && x.c === "?") {
      out.push({ k: "?" });
      continue;
    }
    if (x.q === 0 && x.c === "[") {
      let j = i + 1;
      const neg = j < seg.length && (seg[j].c === "!" || seg[j].c === "^");
      if (neg) j++;
      let k = j < seg.length && seg[j].c === "]" ? j + 1 : j;
      while (k < seg.length && !(seg[k].c === "]" && seg[k].q === 0)) {
        const end = unitEnd(chars, k);
        k = end > 0 ? end : k + 1;
      }
      if (k < seg.length) {
        out.push({ k: "[", test: classTest(chars.slice(j, k), neg) });
        i = k;
        continue;
      }
    }
    out.push({ k: "c", c: x.c.toLowerCase() });
  }
  return out;
}

// overlap(G, P, strict) — for glob G and name pattern P (both token lists),
// -1 when no string matches both, else how many of P's literal characters
// G's own literals (and classes, unless strict) match in the best such
// string (capped at 2).
function overlap(G, P, strict) {
  const memo = new Map();
  function go(i, j) {
    const key = i * 4096 + j;
    if (memo.has(key)) return memo.get(key);
    let best = i === G.length && j === P.length ? 0 : -1;
    const g = G[i];
    const p = P[j];
    if (g && g.k === "*") {
      best = Math.max(best, go(i + 1, j));
      if (p) best = Math.max(best, go(i, j + 1));
    }
    if (p && p.k === "*") {
      best = Math.max(best, go(i, j + 1));
      if (g && g.k !== "*") best = Math.max(best, go(i + 1, j));
    }
    if (g && p && g.k !== "*" && p.k === "c") {
      const ok = g.k === "?" || (g.k === "c" ? g.c === p.c : g.test(p.c));
      const rest = ok ? go(i + 1, j + 1) : -1;
      const own = g.k === "c" || (g.k === "[" && !strict) ? 1 : 0;
      if (rest >= 0) best = Math.max(best, Math.min(2, rest + own));
    }
    memo.set(key, best);
    return best;
  }
  return go(0, 0);
}

const literal = (s) => [...s].map((c) => ({ c, q: c === "*" ? 0 : 1 }));

// createMatcher(E, { hiddenDot }) — a matcher over CF_PRIVACY_GLOB_NAMES.
// hiddenDot (default true): a dot name needs a literal leading dot, as shell
// globs skip dotfiles; Grep globs (false) make no such promise.
function createMatcher(E, opts) {
  const hiddenDot = !opts || opts.hiddenDot !== false;
  const sensitive = list(E, "CF_PRIVACY_SENSITIVE").map(ere);
  const globNames = list(E, "CF_PRIVACY_GLOB_NAMES");
  const CODE_EXT = one(E, "CF_PRIVACY_CODE_EXT");
  const SECRET_STEM = one(E, "CF_PRIVACY_SECRET_STEM");
  const DOC_EXT = one(E, "CF_PRIVACY_DOC_EXT");
  if (!sensitive.length || !globNames.length) throw new Error("missing patterns");

  // A name that matches no SENSITIVE row (*secret*) is a keyword name: a
  // glob segment ending in a source extension (*secret*.ts) is exempt from
  // it, except for the exact secret stems (secrets.py) Read also blocks.
  const NAMES = globNames.map((name) => {
    const bare = name.replace(/\*/g, "");
    const keyword = !sensitive.some((r) => r.test(bare) || r.test(bare + "/"));
    return {
      name,
      tokens: globTokens(literal(name)),
      dot: name[0] === ".",
      keyword,
      stems: keyword
        ? [bare, bare + "s"]
            .filter((s) => SECRET_STEM.test(s + ".x"))
            .map((s) => ({ name: s + ".*", tokens: globTokens(literal(s)) }))
        : [],
    };
  });

  // globPattern(word, strict) — the sensitive name a glob segment of word
  // could match, or null. A segment needs a literal character (build/*
  // stays allowed); names need 2 of their literal characters matched by the
  // segment's own (*.ts may not match *secret* through its star alone), a
  // dot name only its dot when the segment starts with a literal dot.
  // strict (quoted globs a nested shell may expand):
  // every * ? [ counts, only literals count as matched, and dot names need 2.
  function globPattern(word, strict) {
    const items = strict ? word.map((x) => ({ c: x.c, q: 0 })) : word;
    const segs = [[]];
    for (const x of items) {
      if (x.c === "/") segs.push([]);
      else segs[segs.length - 1].push(x);
    }
    for (const seg of segs) {
      if (!seg.some(isGlob) || seg.every(isGlob)) continue;
      const G = globTokens(seg);
      let last = seg.length;
      while (last > 0 && !isGlob(seg[last - 1])) last--;
      const tail = text(seg.slice(last));
      const codeTail = CODE_EXT.test(tail);
      const lead = G[0].k === "c" && G[0].c === ".";
      for (const n of NAMES) {
        if (n.dot && hiddenDot && !lead) continue;
        if (n.keyword && codeTail) {
          if (DOC_EXT.test(tail)) continue;
          const S = globTokens(seg.slice(0, last + tail.lastIndexOf(".")));
          for (const s of n.stems) if (overlap(S, s.tokens, strict) >= 2) return s.name;
          continue;
        }
        const need = n.dot && lead && !strict ? 1 : 2;
        if (overlap(G, n.tokens, strict) >= need) return n.name;
      }
    }
    return null;
  }

  return { globPattern };
}

module.exports = { ere, list, one, text, isGlob, lexGlob, createMatcher };
