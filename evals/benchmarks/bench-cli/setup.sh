#!/usr/bin/env bash
# Setup staged changes for bench-cli eval scenarios
cd "$(dirname "$0")"
sed -i '' '1i\
// Added CSV header support and improved column alignment
' src/format.ts
git add src/format.ts
