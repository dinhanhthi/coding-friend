// Added CSV header support and improved column alignment
// Added CSV header support

/**
 * Converts an array of objects to CSV format.
 * Uses the keys of the first object as column headers.
 */
export function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const headerLine = headers.join(",");

  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        const str = val === null || val === undefined ? "" : String(val);
        return str.includes(",") ? `"${str}"` : str;
      })
      .join(","),
  );

  return [headerLine, ...rows].join("\n");
}

/**
 * Converts an array of objects to a formatted text table.
 */
export function toTable(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "(empty)";

  const headers = Object.keys(data[0]);
  const widths = headers.map((h) =>
    Math.max(h.length, ...data.map((row) => String(row[h] ?? "").length)),
  );

  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(" | ");

  const rows = data.map((row) =>
    headers.map((h, i) => String(row[h] ?? "").padEnd(widths[i])).join(" | "),
  );

  return [headerLine, sep, ...rows].join("\n");
}
