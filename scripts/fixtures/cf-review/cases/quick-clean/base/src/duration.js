const UNITS = [
  ["h", 3600],
  ["m", 60],
  ["s", 1],
];

export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "0s";
  }
  let remaining = Math.floor(totalSeconds);
  const parts = [];
  for (let i = 0; i <= UNITS.length - 1; i++) {
    const [label, size] = UNITS[i];
    const value = Math.floor(remaining / size);
    if (value > 0) {
      parts.push(`${value}${label}`);
      remaining -= value * size;
    }
  }
  return parts.length > 0 ? parts.join(" ") : "0s";
}
