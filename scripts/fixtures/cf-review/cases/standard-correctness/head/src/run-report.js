export function buildRunReport(results) {
  const rows = results.map((result) => ({
    id: result.id,
    attempts: result.attempts,
    value: result.value,
  }));

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const suffix =
      i + 1 < rows.length && rows[i + 1].id === row.id ? " (duplicate id)" : "";
    lines.push(
      `${row.id}: ${String(row.value)} after ${row.attempts}${suffix}`,
    );
  }

  const retried = rows.filter((row) => row.attempts > 1).length;
  const total = rows.length;
  const retriedPercent = total === 0 ? 0 : Math.round((retried / total) * 100);

  return {
    lines,
    total,
    retried,
    retriedPercent,
  };
}
