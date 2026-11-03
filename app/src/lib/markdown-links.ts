/** What a markdown link may do in the app (Contracts "Markdown trong app"). */
export type LinkTarget =
  /** Another markdown file of the same tree, relative to the tree (posix, normalized). */
  | { kind: "internal"; path: string }
  /** An `https:` URL; opened only through the Rust `open_url` confirm. */
  | { kind: "external"; url: string }
  /** Anything else: shown as plain text, never followed. */
  | { kind: "text" };

/** Same limit as `MAX_URL` in app/src-tauri/src/commands.rs. */
const MAX_URL = 2048;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const MARKDOWN_FILE = /\.(md|markdown)$/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const TEXT: LinkTarget = { kind: "text" };

function segments(path: string): string[] {
  return path.split("/").filter((s) => s !== "" && s !== ".");
}

/**
 * Classifies `href` from a file at `currentPath`. Both `currentPath` and `treeRoot` are
 * posix paths relative to the tree (docs, memory or learn); `treeRoot` (default: the whole
 * tree) is the folder a relative link may not leave through `..`.
 */
export function classifyLink(
  href: string,
  currentPath: string,
  treeRoot = "",
): LinkTarget {
  if (href.length > MAX_URL || CONTROL.test(href) || href.includes("\\"))
    return TEXT;

  if (SCHEME.test(href)) {
    if (!href.toLowerCase().startsWith("https://")) return TEXT;
    try {
      const url = new URL(href);
      return url.protocol === "https:" && url.hostname !== ""
        ? { kind: "external", url: url.href }
        : TEXT;
    } catch {
      return TEXT;
    }
  }

  // Bare anchors, queries and absolute or protocol-relative paths stay text.
  const file = href.split(/[?#]/, 1)[0];
  if (file === "" || file.startsWith("/")) return TEXT;
  let decoded: string;
  try {
    decoded = decodeURIComponent(file);
  } catch {
    return TEXT;
  }
  // Decoded before resolving, so `%2e%2e` and `%5c` count as `..` and `\`.
  if (
    CONTROL.test(decoded) ||
    decoded.includes("\\") ||
    decoded.startsWith("/")
  )
    return TEXT;

  const root = segments(treeRoot);
  const resolved = segments(currentPath).slice(0, -1);
  if (!root.every((s, i) => resolved[i] === s)) return TEXT;
  for (const segment of segments(decoded)) {
    if (segment !== "..") resolved.push(segment);
    else if (resolved.length > root.length) resolved.pop();
    else return TEXT;
  }
  const path = resolved.join("/");
  return MARKDOWN_FILE.test(path) ? { kind: "internal", path } : TEXT;
}
