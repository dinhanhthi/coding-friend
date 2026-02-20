---
name: cf-verification
version: 1.5.0
description: Verify before claiming work is complete
user-invocable: false
---

# Verification Before Completion

## The Gate

**No completion claims without fresh verification evidence.**

Claiming work is complete without verification is dishonesty, not efficiency.

## Checklist

Before claiming ANY task is done:

1. **Run tests** — Execute the test suite. Read the output. All tests must pass.
2. **Run the build** — If applicable, build the project. No errors.
3. **Lint/format** — If configured, run linter. No new warnings.
4. **Manual check** — For UI changes, verify visually. For API changes, test the endpoint.
5. **Show evidence** — Include test output, build output, or screenshots in your response.

## What Counts as Evidence

| Good Evidence | Bad Evidence |
|---|---|
| Test output showing all pass | "I believe the tests pass" |
| Build output with exit code 0 | "The build should work" |
| Actual command output | "I ran the tests" (without output) |
| Screenshot of UI change | "The UI looks correct" |
| `git diff` showing the change | "I made the change" |

## Common Failures

- [ ] Tests pass
- [ ] No type errors (TypeScript/typed languages)
- [ ] Linter clean
- [ ] Build succeeds
- [ ] No console errors/warnings
- [ ] Feature works as described
- [ ] No regressions in existing functionality
