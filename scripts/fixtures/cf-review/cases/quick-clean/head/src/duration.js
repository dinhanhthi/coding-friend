const UNITS = [
  ["h", 3600],
  ["m", 60],
  ["s", 1],
];

const ALL_PARTS = UNITS.length;

export function formatDuration(totalSeconds, options = {}) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "0s";
  }
  const maxParts = normalizeMaxParts(options.maxParts);
  let remaining = Math.floor(totalSeconds);
  const parts = [];
  for (let i = 0; i <= UNITS.length - 1; i++) {
    const [label, size] = UNITS[i];
    const value = Math.floor(remaining / size);
    if (value > 0) {
      parts.push(`${value}${label}`);
      remaining -= value * size;
      if (parts.length >= maxParts) {
        break;
      }
    }
  }
  return parts.length > 0 ? parts.join(" ") : "0s";
}

function normalizeMaxParts(value) {
  if (value === undefined) {
    return ALL_PARTS;
  }
  if (!Number.isInteger(value) || value < 1) {
    return ALL_PARTS;
  }
  return Math.min(value, ALL_PARTS);
}
