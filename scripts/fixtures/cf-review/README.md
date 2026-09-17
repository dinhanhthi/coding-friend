# cf-review quality corpus

Three synthetic changes used to measure what `cf-review` actually finds. Built for
task 5.1 of the `2026-09-15-cf-review-lean-pipeline` plan.

**The code in `cases/` contains seeded defects on purpose. Do not fix them.** They
are the thing being measured; "fixing" a fixture destroys the measurement. Nothing
here is imported, executed, built, tested or linted by this repository — the files
exist only to be read as a diff.

`quality-cases.json` is the **answer key**: which defects are seeded, where, and what
a finding has to say to count. It must never be inside the scope of a review that is
being scored, and it must never be pasted into a reviewer prompt.

## Commands

```bash
node scripts/fixtures/cf-review/quality-corpus.mjs list
node scripts/fixtures/cf-review/quality-corpus.mjs verify            # key anchors + assessed mode
node scripts/fixtures/cf-review/quality-corpus.mjs materialize all   # writes to <tmp>/cf-review-quality/
node scripts/fixtures/cf-review/quality-corpus.mjs template --out results.json
node scripts/fixtures/cf-review/quality-corpus.mjs score results.json
```

`materialize` builds each case as a real git working tree **outside this repository**
(base state committed, the change left uncommitted), runs the cf-review scope
snapshot and depth assessor against it, and prints the repo path plus the assessed
mode. Point a reviewer at that repo — not at this directory.

`score` exits non-zero when any absolute quality gate fails, including on a results
file that was never filled in.

Full procedure, gates and the honesty rules for reporting a run:
`docs/plans/2026-09-15-cf-review-lean-pipeline/measurements.md` (local artifact,
`docs/plans/` is gitignored).

## Fixture policy

- Synthetic code only. No secrets, credentials or user data; placeholder values carry
  a `DUMMY_` marker.
- No comment, name or marker in `cases/` points at a seeded defect.
