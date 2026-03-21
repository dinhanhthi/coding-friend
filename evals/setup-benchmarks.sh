#!/usr/bin/env bash
# setup-benchmarks.sh — Prepare benchmark repos with correct git state for eval runs
# Run this before starting eval waves to set up staged changes, etc.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BENCH_DIR="$SCRIPT_DIR/benchmarks"

echo "=== Setting up benchmark repos ==="

# bench-webapp: stage validator.ts as "newly added" for commit scenario
echo "[bench-webapp] Setting up staged changes..."
cd "$BENCH_DIR/bench-webapp"
git reset --hard HEAD 2>/dev/null || true
git clean -fd 2>/dev/null || true
# Add a new utility function to validator.ts to simulate a pending change
cat >> src/lib/validator.ts <<'CODE'

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-()]{7,15}$/;
  return phoneRegex.test(phone.trim());
}
CODE
git add src/lib/validator.ts
echo "  Staged: validator.ts with new validatePhone function"

# bench-cli: format.ts has comment change for commit scenario
echo "[bench-cli] Setting up staged changes..."
cd "$BENCH_DIR/bench-cli"
git reset --hard HEAD 2>/dev/null || true
git clean -fd 2>/dev/null || true
# The format.ts already has the CSV header comment — stage it
sed -i '' '1i\
// Added CSV header support and improved column alignment
' src/format.ts
git add src/format.ts
echo "  Staged: format.ts with header comment"

# bench-library: add a small change for commit scenario
echo "[bench-library] Setting up staged changes..."
cd "$BENCH_DIR/bench-library"
git reset --hard HEAD 2>/dev/null || true
git clean -fd 2>/dev/null || true
cat >> src/array-utils.ts <<'CODE'

export function flatten<T>(arr: T[][]): T[] {
  return arr.reduce((acc, val) => acc.concat(val), []);
}
CODE
git add src/array-utils.ts
echo "  Staged: array-utils.ts with new flatten function"

# bench-research: no changes needed
echo "[bench-research] No setup needed"

echo ""
echo "=== All benchmarks ready ==="
echo "Run: ./run-wave.sh --wave 1 --runs 1 --model opus"
