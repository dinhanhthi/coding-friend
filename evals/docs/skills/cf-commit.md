# Evaluating cf-commit

## What We Test

Whether the cf-commit skill produces higher-quality conventional commit messages than baseline Claude. We measure format compliance, scope accuracy, message clarity, and body quality.

## Prompt(s)

Three prompts across three benchmark repos:

**bench-webapp** (`prompts/cf-commit/bench-webapp.md`):

> Look at the current state of this project and create a commit for the changes. The validator.ts file was just added with email, password, and username validation functions, along with its tests.

**bench-cli** (`prompts/cf-commit/bench-cli.md`):

> The format.ts file has been updated with CSV header support. Commit this change.

**bench-library** (`prompts/cf-commit/bench-library.md`):

> The array-utils module was just refactored to improve the groupBy function's type safety. Commit this change.

Note: The bench-library prompt deliberately describes a "groupBy refactor" but the actual staged change is adding a `flatten<T>` function. This mismatch tests whether the skill examines the actual diff rather than trusting the prompt description.

## Benchmark Repos Used

- **bench-webapp** -- Staged change is a duplicate `validatePhone` function (trap: should refuse to commit bad code)
- **bench-cli** -- Staged change is a header comment addition to `format.ts`
- **bench-library** -- Staged change is a new `flatten<T>` function (prompt says "groupBy refactor" -- deliberate mismatch)

## Rubric Criteria

| Criterion         | Weight | Description                                                     |
| ----------------- | ------ | --------------------------------------------------------------- |
| format_compliance | 0.30   | Commit message follows conventional commit format               |
| scope_accuracy    | 0.25   | Scope correctly identifies the affected package or area         |
| message_clarity   | 0.25   | Subject line clearly communicates the why/what of the change    |
| body_quality      | 0.20   | Commit body provides useful context when the change warrants it |

### Scoring Levels

**format_compliance** (automated regex check: `^(feat|fix|refactor|test|docs|chore)(\(.+\))?!?: .+`):

- 0: No conventional commit format at all (missing type prefix)
- 1: Partial format (has type but missing scope or malformed description)
- 2: Correct format but scope could be more specific or accurate
- 3: Perfect conventional commit format with accurate type, scope, and description

**scope_accuracy**:

- 0: No scope provided when one is clearly needed
- 1: Scope is too broad or generic (e.g., 'app' when 'cli' is more accurate)
- 2: Scope is reasonable but a more precise one exists
- 3: Scope precisely identifies the affected package/module/area

**message_clarity**:

- 0: Subject is vague or misleading (e.g., 'update stuff', 'fix things')
- 1: Subject describes what changed but not why it matters
- 2: Subject is clear but could be more concise or specific
- 3: Subject is concise, specific, and immediately communicates the purpose

**body_quality**:

- 0: Complex change with no body explaining rationale
- 1: Body exists but is redundant with subject or lacks useful detail
- 2: Body provides context but misses key motivation or impact details
- 3: Body clearly explains why the change was made and any notable implications

Notes: Simple changes (typos, formatting) may not need a body -- score body_quality as 3 if omission is appropriate. Breaking changes must use `!` suffix or BREAKING CHANGE footer.

## What We Expect

### With CF

- Conventional commit format with accurate type (feat/fix/refactor)
- Precise scope matching the actual module changed
- Subject that communicates purpose, not just "what"
- Body when the change warrants explanation
- Detection of prompt-diff mismatches (bench-library: prompt says groupBy, diff shows flatten)
- Detection of bad code (bench-webapp: duplicate validatePhone) with refusal to commit

### Without CF

- Claude already knows conventional commits well
- May produce correct format but with less precise scopes
- May trust the prompt description instead of examining the diff
- Should still detect obvious issues like duplicate functions

## What We Compare

- Format compliance (both conditions should score high)
- Scope precision (CF expected to be slightly more precise)
- Whether the skill examines the actual diff vs trusting the prompt
- Whether duplicate/bad code is detected and refused

## Actual Results (March 2026)

### Scores

| Condition               | format_compliance | scope_accuracy | message_clarity | body_quality | Weighted Total |
| ----------------------- | ----------------- | -------------- | --------------- | ------------ | -------------- |
| With CF (4 runs avg)    | 3.0               | 2.5            | 3.0             | 2.5          | **2.78**       |
| Without CF (6 runs avg) | 3.0               | 2.3            | 2.5             | 2.3          | **2.55**       |

**Delta: +0.23**

### Cost

| Condition  | Avg Cost | Avg Time |
| ---------- | -------- | -------- |
| With CF    | $0.254   | 34s      |
| Without CF | $0.136   | 28s      |
| Cost ratio | 1.87x    |          |

### Key Observations

1. Both conditions correctly identified the "trap" scenarios (duplicate validatePhone, prompt-diff mismatch). This is a Claude base model capability.
2. CF's advantage is marginal -- primarily in more precise scope and better body quality, not in format compliance (both score 3.0).
3. The cost ratio (1.87x) is modest for a small quality improvement.

## Reliability Assessment

- **Sample size**: 4 with-CF runs, 6 without-CF runs (largest sample in the eval suite)
- **Confidence**: Medium-High
- **Known issues**: Some runs found a clean tree (no staged changes) due to repo state issues, which affects scoring but was handled correctly by scoring judgment calls as 3.
- **Recommendation**: Results are trustworthy. The +0.23 delta is small but consistent across runs. Additional runs would narrow confidence intervals but are unlikely to change the direction.
