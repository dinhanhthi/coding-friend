# Coding Friend Evaluation Framework

## Purpose

This framework measures whether the Coding Friend plugin actually improves Claude Code's output quality. It does this through controlled A/B tests: the same prompts are run against the same benchmark repos, once with the Coding Friend plugin active ("with-cf") and once with bare Claude Code ("without-cf"). Results are scored against rubrics with weighted criteria on a 0-3 scale.

The goal is honest measurement, not marketing. Several skills show no improvement over baseline Claude, and that is documented faithfully.

## How to Run Evals

### Prerequisites

1. Set up benchmark repos:

   ```bash
   ./setup-benchmarks.sh
   ```

2. Ensure `claude` CLI is installed and authenticated.

### Single Eval

```bash
./run-eval.sh \
  --prompt prompts/cf-commit/bench-webapp.md \
  --condition with-cf \
  --skill cf-commit \
  --repo benchmarks/bench-webapp \
  --model sonnet
```

Options:

- `--condition with-cf` -- Normal mode with Coding Friend plugin loaded
- `--condition without-cf` -- Bare mode (plugins disabled, no slash commands)
- `--model <model>` -- Model to use (default: sonnet)
- `--budget <amount>` -- Max cost per run in USD
- `--dry-run` -- Show the command without executing

### Full Wave

```bash
# Preview what will run
./run-wave.sh --wave 1 --dry-run

# Run wave 1 with 3 runs per combination
./run-wave.sh --wave 1 --runs 3

# Run a single skill from a wave
./run-wave.sh --wave 1 --skill cf-review --runs 3

# Run all waves
./run-wave.sh --wave all --runs 3 --model sonnet
```

### Scoring

```bash
# Score a single skill
./score.sh --skill cf-commit

# Score all skills in a wave
./score.sh --wave 1
```

The scorer applies regex-based automated checks from rubric files against eval outputs. It generates pass/fail per criterion and writes detailed JSON scores to `analysis/`.

## Scoring Methodology

### Rubric Scale (0-3)

Each skill has a JSON rubric file (`rubrics/<skill>.json`) defining weighted criteria. Every criterion is scored on a 4-point scale:

| Score | Meaning                                    |
| ----- | ------------------------------------------ |
| 0     | Absent or fundamentally wrong              |
| 1     | Present but shallow or partially incorrect |
| 2     | Good but with minor gaps                   |
| 3     | Excellent -- meets the criterion fully     |

### Weighted Score Calculation

Each criterion has a weight (summing to 1.0). The weighted total is:

```
score = sum(criterion_score * criterion_weight)
```

### Pass Threshold

A score of **2.0** or higher is a pass. Below 2.0 indicates the skill failed to meet minimum quality.

### Automated Checks

Rubrics support two check types:

- **Regex checks** -- pattern matching against eval output (e.g., verifying conventional commit format)
- **Command checks** -- running a command and checking exit code (e.g., `npm test`). Command checks are defined in rubrics but not yet fully implemented in the scorer.

## A/B Test Design

### Conditions

| Condition    | How it works                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `with-cf`    | Claude Code runs normally. The Coding Friend plugin is loaded via hooks and CLAUDE.md. All skills, agents, and auto-invocations are active.                      |
| `without-cf` | Claude Code runs with `--disable-slash-commands`. All plugins are disabled before the run and re-enabled afterward. No hooks, no skill files, no auto-discovery. |

### Execution

1. **Repo reset**: Before each run, the benchmark repo is reset to a known state (`git reset --hard`, `git clean -fd`, then the benchmark-specific `setup.sh` re-applies staged changes).
2. **Run**: `claude -p "<prompt>" --output-format json --dangerously-skip-permissions --no-session-persistence`
3. **Capture**: JSON output saved to `results/<skill>/<condition>/<timestamp>.json` with metadata in a `.meta.json` sidecar.
4. **Post-run reset**: The repo is reset again so the next run starts from the same state.

### What `--no-session-persistence` Means

Runs use `--no-session-persistence` to prevent session state leaking between evals. This is important for isolation but means the cf-session skill cannot be properly evaluated (it needs session files to exist).

## Benchmark Repos

| Repo             | Description                                                                                                                               | Used by                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bench-webapp`   | TypeScript web app with API client, cache, validator modules. Has planted bugs (duplicate function, missing error handling, memory leak). | cf-commit, cf-review, cf-fix, cf-optimize, cf-ask, cf-scan, cf-learn, cf-remember, cf-ship, cf-session, cf-help, cf-verification, cf-auto-review, cf-plan |
| `bench-cli`      | TypeScript CLI tool with transform and format modules. Has planted bugs (null crash in sortByField, missing CSV escaping).                | cf-commit, cf-review, cf-fix, cf-tdd, cf-scan, cf-sys-debug                                                                                               |
| `bench-library`  | TypeScript utility library with array-utils and string-utils. Clean code, no planted bugs.                                                | cf-commit, cf-tdd, cf-plan, cf-ask                                                                                                                        |
| `bench-research` | Minimal repo for research tasks. No source code -- used as a working directory for web research.                                          | cf-research                                                                                                                                               |

### Setup

`setup-benchmarks.sh` prepares each repo with the correct git state:

- **bench-webapp**: Stages `validator.ts` with a new `validatePhone` function (which is a duplicate of an existing one -- this is intentional as a trap).
- **bench-cli**: Stages `format.ts` with a header comment.
- **bench-library**: Stages `array-utils.ts` with a new `flatten<T>` function.

## Results Summary (March 2026)

### Skills Where CF Adds Clear Value

| Skill           | With CF | Without CF | Delta     | Why                                                                          |
| --------------- | ------- | ---------- | --------- | ---------------------------------------------------------------------------- |
| cf-fix          | 3.00    | 1.90       | **+1.10** | Enforces test-driven bug fixing. Without CF, tests are never written.        |
| cf-tdd (re-run) | 1.65    | 0.78       | **+0.87** | Auto-invokes TDD when not explicitly requested (50% of the time).            |
| cf-review       | 3.00    | 2.53       | **+0.47** | Structured output with severity categorization and file:line refs.           |
| cf-learn        | 3.00    | 2.55       | **+0.45** | Persists learnings to docs/learn/ files. Without CF, knowledge stays inline. |
| cf-commit       | 2.78    | 2.55       | **+0.23** | Slightly more precise scope and body quality.                                |

### Skills Where CF Adds No Value

| Skill           | Score       | Why                                                    |
| --------------- | ----------- | ------------------------------------------------------ |
| cf-ask          | 2.88 / 2.88 | Both answer code questions equally well.               |
| cf-auto-review  | 3.00 / 3.00 | Both produce comprehensive 4-layer reviews.            |
| cf-help         | 2.70 / 2.70 | Both read the same skill docs.                         |
| cf-remember     | 3.00 / 3.00 | Both correctly refused to save derivable info.         |
| cf-sys-debug    | 2.60 / 2.60 | Both found the same root cause with the same approach. |
| cf-verification | 2.70 / 2.70 | Identical behavior: detect, fix, verify.               |
| cf-optimize     | 0.50 / 0.50 | Both failed -- neither measured performance.           |
| cf-session      | 0.00 / 0.00 | Both failed -- eval setup prevented session saves.     |

### Skills Where CF Underperforms

| Skill       | With CF | Without CF | Delta     | Why                                                              |
| ----------- | ------- | ---------- | --------- | ---------------------------------------------------------------- |
| cf-plan     | 1.50    | 2.50       | **-1.00** | CF stops to ask clarifying questions in single-turn eval.        |
| cf-ship     | 2.20    | 2.50       | **-0.30** | Without-CF ran more thorough verification gates.                 |
| cf-scan     | 2.75    | 3.00       | **-0.25** | Without-CF produced more thorough memory files.                  |
| cf-research | 2.70    | 2.75       | **-0.05** | CF spent 6.7x more on web searches for marginally lower quality. |

### Overall

| Metric                                         | Value |
| ---------------------------------------------- | ----- |
| With CF average score (excl. session, plan)    | 2.57  |
| Without CF average score (excl. session, plan) | 2.34  |
| Overall delta                                  | +0.23 |
| Average cost ratio                             | 2.1x  |

## Known Limitations

### Single-Turn Eval Design

All evals are single-turn: one prompt, one response, no follow-up. This fundamentally penalizes skills that have multi-step workflows:

- **cf-plan** asks clarifying questions before generating a plan. In a single-turn eval, no follow-up is provided, so the plan is never completed. This makes cf-plan look -1.0 worse than baseline when in reality it is exercising better engineering judgment.
- **cf-session** requires saving and then loading in a new conversation. Single-turn cannot test the load step.

### Small Sample Size

Most Wave 2 skills had only 1 run per condition. Wave 1 had 2-4 runs. This sample size is insufficient to distinguish signal from noise for small deltas. Results for skills with deltas under 0.30 (positive or negative) should be treated as directional indicators, not conclusions.

### Cost

Running the full eval suite costs approximately $15-25 (dominated by cf-research at $5+ per run). This limits the number of runs and the ability to iterate on eval design quickly.

### Eval-Specific Artifacts

- The `--no-session-persistence` flag prevents cf-session from working at all.
- The benchmark repos are small and synthetic. Real-world projects are larger, messier, and have more context to work with.
- The without-CF condition disables plugins but the cached plugin state may still influence behavior (observed in cf-ask where the without-CF run appeared to use the cf-explorer agent).

### Ordering Effects

Wave 2 ran with-cf and without-cf sequentially (not randomized). This means later runs may benefit from API-level caching or the benchmark repo having residual state. The cf-scan results (where without-CF scored higher) may be affected by this -- the without-CF runs went second and had existing memory files to update.

## Reliability Assessment

### Most Reliable Results

| Skill     | Why reliable                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| cf-fix    | Largest delta (+1.10), consistent across both repos, 2 runs each. The finding (CF writes tests, baseline does not) is binary and unambiguous. |
| cf-review | Consistent 3.0 across both with-CF runs. Structural improvement (severity labels, file:line refs) is objectively verifiable.                  |
| cf-commit | 4 with-CF runs and 6 without-CF runs. Largest sample size. Small delta (+0.23) is consistent.                                                 |

### Least Reliable Results

| Skill       | Why unreliable                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| cf-session  | Eval setup made the skill untestable. 0.0/0.0 tells us nothing about the skill.                                                    |
| cf-plan     | Single-turn design penalizes the skill's correct behavior. -1.0 is an eval design artifact.                                        |
| cf-optimize | Both scored 0.5 -- the skill's core value (measurement discipline) was never activated. May be a skill bug, may be a prompt issue. |
| cf-scan     | 2 runs each but ordering effects may explain the -0.25 delta.                                                                      |
| cf-ship     | 1 run each. -0.30 could easily be noise.                                                                                           |
| cf-research | 1 run each. The 6.7x cost ratio is striking but the quality delta (-0.05) is within noise.                                         |

### What Would Improve Reliability

1. At least 5 runs per condition per skill
2. Randomized run ordering to eliminate cache/sequence effects
3. Multi-turn eval support for cf-plan and cf-session
4. Fix `--no-session-persistence` interaction for cf-session
5. Cost-adjusted scoring (quality per dollar)
6. Larger, more realistic benchmark repos

## Adding a New Eval

1. Add rubric: `rubrics/<skill-name>.json`
2. Add prompts: `prompts/<skill-name>/<repo>.md` for each benchmark repo
3. Add to `waves.json` under the appropriate wave
4. Run: `./run-wave.sh --wave <N> --skill <skill-name> --runs 3`
5. Score: `./score.sh --skill <skill-name>`
6. Add documentation: `docs/skills/<skill-name>.md`
