export function applyTemporalDecay(
  score: number,
  updatedDate: string,
  accessCount?: number,
): number {
  const updated = new Date(updatedDate);
  if (isNaN(updated.getTime())) return score;

  const now = new Date();
  const ageDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);

  score *= 0.7 + 0.3 * Math.exp(-ageDays / 90);

  if (accessCount !== undefined) {
    score *= 1 + 0.05 * Math.min(accessCount, 10);
  }

  return score;
}
