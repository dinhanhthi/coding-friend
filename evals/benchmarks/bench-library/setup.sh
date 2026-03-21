#!/usr/bin/env bash
# Setup staged changes for bench-library eval scenarios
cd "$(dirname "$0")"
cat >> src/array-utils.ts <<'CODE'

export function flatten<T>(arr: T[][]): T[] {
  return arr.reduce((acc, val) => acc.concat(val), []);
}
CODE
git add src/array-utils.ts
