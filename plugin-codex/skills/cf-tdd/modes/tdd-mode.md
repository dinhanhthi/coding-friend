# TDD Mode Details

## TDD Mode (`--add-tests` or `tdd: true` in config)

### RED — Write a failing test

1. Read `${PLUGIN_ROOT}/lib/protocols/test-scope.md` first — decide whether a new test is needed at all. If not, implement directly and say why.
2. Write the smallest test that describes the desired behavior
3. Run it. It MUST fail. If it passes, you don't need this code.
4. The failure message should clearly describe what's missing

### GREEN — Make it pass

1. Write the **minimum** production code to make the test pass
2. No extra features, no "while I'm here" improvements
3. Run the test. It MUST pass.

### REFACTOR — Clean up

1. Remove duplication between test and production code
2. Improve naming, extract functions if needed
3. Run ALL tests. They MUST still pass.

## Test Quality Checklist (TDD mode only)

- [ ] Test describes behavior, not implementation
- [ ] Test has a clear failure message
- [ ] Test is independent (no shared mutable state)
- [ ] Test runs fast (<1s)
- [ ] One assertion per test (or closely related assertions)

## Anti-Patterns (TDD mode only)

1. **Testing mocks, not behavior** — If your test only verifies mock calls, it tests nothing
2. **Test-only seams in production** — Never add methods, exports, or wrappers just to make testing easier
3. **Integration test as afterthought** — Unit tests first, then integration tests for boundaries
