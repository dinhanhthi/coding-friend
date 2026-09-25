# Test Scope

Read before writing or requesting a test. Applies to TDD mode, regression tests, and test-coverage review.

- A test must protect observable behavior, a contract, or a credible regression. Use the smallest test that reliably proves it.
- Not every change needs a new test: renames, copy, config, docs, pure refactors, and small reversible implementation tweaks usually need none. Cover only the paths the change puts at risk, not every failure or edge case.
- One owner test per contract, at the strongest boundary. Extend an existing case or table instead of adding a near-duplicate; no combinatorial matrices.
- No exports, wrappers, or seams that only tests use.
- Bug fixes: the regression test must fail on the pre-fix code for the intended reason.
