// Incremental reader of a growing JSONL file by byte offset. Only complete
// lines (ending in `\n`) are returned; a cut last line is left for the next
// call. Reads through an fd at an offset, never the whole file.

import { closeSync, fstatSync, openSync, readSync } from "fs";

/** A line longer than this (newline excluded) is skipped, never returned. */
export const LINE_MAX_BYTES = 16 * 1024 * 1024;

const SCAN_CHUNK = 1024 * 1024;

export interface LineSlice {
  lines: string[];
  /** Offset just past the last newline consumed. */
  nextOffset: number;
  /** File size at the time of the read. */
  size: number;
  /** Lines over LINE_MAX_BYTES passed over. */
  skipped: number;
  /**
   * The byte cap stopped the read before the end of the file: complete lines
   * may remain after `nextOffset` (call again at once).
   */
  truncated: boolean;
}

function readAt(fd: number, pos: number, len: number): Buffer {
  const buf = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = readSync(fd, buf, got, len - got, pos + got);
    if (n === 0) break;
    got += n;
  }
  return buf.subarray(0, got);
}

/** Absolute position of the next `\n` at or after `from`, or -1 before EOF. */
function findNewline(fd: number, from: number, size: number): number {
  const buf = Buffer.alloc(SCAN_CHUNK);
  let pos = from;
  while (pos < size) {
    const n = readSync(fd, buf, 0, Math.min(SCAN_CHUNK, size - pos), pos);
    if (n === 0) break;
    const i = buf.subarray(0, n).indexOf(0x0a);
    if (i !== -1) return pos + i;
    pos += n;
  }
  return -1;
}

/**
 * Complete lines from `offset`, reading at most `maxBytes` raw bytes. When the
 * first complete line is longer than `maxBytes`, it is read whole up to
 * LINE_MAX_BYTES; a longer one is skipped once its newline exists.
 */
export function readCompleteLines(
  path: string,
  offset: number,
  maxBytes: number,
): LineSlice {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const out: LineSlice = {
      lines: [],
      nextOffset: offset,
      size,
      skipped: 0,
      truncated: false,
    };
    if (offset >= size) return out;
    const len = Math.min(Math.max(1, maxBytes), size - offset);
    const capped = len < size - offset;
    const window = readAt(fd, offset, len);
    let start = 0;
    let nl = window.indexOf(0x0a);
    while (nl !== -1) {
      out.lines.push(window.toString("utf8", start, nl));
      start = nl + 1;
      nl = window.indexOf(0x0a, start);
    }
    if (start > 0) {
      out.nextOffset = offset + start;
      out.truncated = capped;
      return out;
    }
    if (!capped) return out;
    // No newline within maxBytes: one long first line.
    const end = findNewline(fd, offset + window.length, size);
    if (end === -1) return out;
    if (end - offset <= LINE_MAX_BYTES) {
      out.lines.push(readAt(fd, offset, end - offset).toString("utf8"));
    } else {
      out.skipped = 1;
    }
    out.nextOffset = end + 1;
    out.truncated = out.nextOffset < size;
    return out;
  } finally {
    closeSync(fd);
  }
}
