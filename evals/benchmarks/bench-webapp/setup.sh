#!/usr/bin/env bash
# Setup staged changes for bench-webapp eval scenarios
cd "$(dirname "$0")"
cat >> src/lib/validator.ts <<'CODE'

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-()]{7,15}$/;
  return phoneRegex.test(phone.trim());
}
CODE
git add src/lib/validator.ts
