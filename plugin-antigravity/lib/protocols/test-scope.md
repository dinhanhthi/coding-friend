# Test Scope

Read before planning, writing, or requesting a test. Applies to plans, TDD mode, regression tests, and test-coverage review. Few, high-value tests beat many trivial ones.

- Add a new test only when it guards one of: (1) the core behavior of a key feature, (2) a security-sensitive path (auth, permissions, input validation, path/command handling, secrets, crypto), (3) a breaking change or public contract (CLI flags/output, config schema, file formats, exported API, hook/agent contracts), (4) a bug regression. Anything else gets no new test — run the existing suite instead.
- Never add trivial tests: constants, types/shapes, getters/setters, re-exports, copy/docs/config values, mock-call-only assertions, framework or library behavior, one test per branch, or every edge case. Renames, pure refactors, and small reversible tweaks need none — unless they touch a security-sensitive path, which is never exempt.
- Per guarded behavior: the happy path plus the one failure that matters — usually 1–3 cases. Extend an existing case or table instead of adding a near-duplicate; no combinatorial matrices.
- One owner test per contract, at the strongest boundary. No exports, wrappers, or seams that only tests use.
- A test listed in a plan is a candidate, not a requirement — drop it if it fails these rules, and say why.
- Bug fixes: the regression test must fail on the pre-fix code for the intended reason.
