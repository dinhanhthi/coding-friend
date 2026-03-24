# Coding Friend Evaluation Framework

Controlled A/B tests measuring whether the Coding Friend plugin improves Claude Code's output quality. Same prompts, same benchmark repos, with-cf vs without-cf. Scored against rubrics on a 0-3 scale.

## Quick Start

```bash
# Run eval for a single model (most common), runs=3
./run-full-eval.sh --model sonnet # options: haiku, sonnet, opus

# Run in number of runs
./run-full-eval.sh --model sonnet --runs 2

# Preview without executing
./run-full-eval.sh --model sonnet --dry-run

# All models, all waves, 3 runs each
./run-full-eval.sh

# Specific wave only
./run-full-eval.sh --model sonnet --wave security # options: 1, 2, 3 (alias "security"), all (default)

# Multiple models
./run-full-eval.sh --model sonnet --model opus # options: haiku, sonnet, opus

# Quick run (1 per combo)
./run-full-eval.sh --model sonnet --runs 1

# Skip setup if benchmarks already prepared
./run-full-eval.sh --model sonnet --skip-setup

# Budget cap per run
./run-full-eval.sh --model sonnet --budget 0.50
```

In order to save the tokens,

```bash
# Session 1
./run-full-eval.sh --model sonnet --wave 1 --skip-score

# Session 2
./run-full-eval.sh --model sonnet --wave 2 --skip-score --skip-setup

# Session 3 (wave 3 + scoring)
./run-full-eval.sh --model sonnet --wave 3 --skip-setup

```

Options for `run-full-eval.sh`:

| Option              | Default                   | Description                        |
| ------------------- | ------------------------- | ---------------------------------- |
| `--model <name>`    | all (haiku, sonnet, opus) | Model to use. Repeat for multiple. |
| `--runs <N>`        | 3                         | Runs per combination               |
| `--wave <1          | 2                         | 3                                  |
| `--skill <name>`    |                           | Run only this skill                |
| `--budget <amount>` |                           | Max cost per run in USD            |
| `--dry-run`         |                           | Preview all runs without executing |
| `--skip-setup`      |                           | Skip benchmark repo setup          |
| `--skip-score`      |                           | Skip scoring and JSON generation   |

## Output Structure

```
results/<date>/<model>/wave-<N>/<skill>/<bench-repo>/
  ├── <condition>--<timestamp>.json              # raw Claude output (final result)
  ├── <condition>--<timestamp>.meta.json         # metadata (wall time, cost, model)
  ├── <condition>--<timestamp>.conversation.txt  # full conversation log
  └── <condition>--<timestamp>.llm-score.json    # cached LLM judge scores
analysis/<date>/<model>/wave-<N>/
  └── <skill>-<bench-repo>-<condition>-scores.json  # scoring results
website/src/data/eval-results.json                   # aggregated website data
```

Example:

```
results/2026-03-24/sonnet/wave-1/cf-review/bench-webapp/with-cf--2026-03-24T14-32-15.json
results/2026-03-24/sonnet/wave-1/cf-review/bench-webapp/with-cf--2026-03-24T14-32-15.meta.json
results/2026-03-24/sonnet/wave-1/cf-fix/bench-cli/without-cf--2026-03-24T14-32-15.json
analysis/2026-03-24/sonnet/wave-1/cf-review-bench-webapp-with-cf-scores.json
```

## Data Flow

```
run-full-eval.sh                          <- top level: all models, all waves
  ├── setup-benchmarks.sh                     (prepare repos)
  ├── for each model (haiku, sonnet, opus):
  │   └── run-wave.sh × N waves              <- one model, one wave
  │       └── for each skill × repo × condition:
  │           └── run-eval.sh                <- single eval run
  │               └── results/<date>/<model>/wave-<N>/<skill>/<bench-repo>/<condition>--<timestamp>.json
  ├── score.sh --wave all                     (automated scoring)
  │   └── analysis/<date>/<model>/wave-<N>/<skill>-<bench-repo>-<condition>-scores.json
  └── generate-eval-json.sh                   (website data)
      └── website/src/data/eval-results.json
```

## Lower-Level Scripts

Rarely needed directly -- `run-full-eval.sh` calls these automatically.

| Script                                                                      | When to use                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------- |
| `run-wave.sh --wave 1 --model sonnet --runs 3`                              | Run a specific wave with a specific model      |
| `run-eval.sh --prompt ... --condition with-cf --skill cf-review --repo ...` | Debug a single prompt or test a rubric change  |
| `score.sh --wave all`                                                       | Re-score without re-running evals              |
| `generate-eval-json.sh`                                                     | Re-generate website JSON from existing results |
| `setup-benchmarks.sh`                                                       | Manually prepare benchmark repos               |

## A/B Test Design

| Condition    | How it works                                                                             |
| ------------ | ---------------------------------------------------------------------------------------- |
| `with-cf`    | Normal mode -- Coding Friend plugin loaded with all skills, agents, and auto-invocations |
| `without-cf` | Bare mode -- `--disable-slash-commands`, all plugins disabled                            |

Each run: repo reset -> claude -p -> capture JSON -> repo reset. Uses `--no-session-persistence` for isolation.

## Scoring

Each skill has a rubric (`rubrics/<skill>.json`) with weighted criteria scored 0-3. Pass threshold: **2.0**.

**Two-layer scoring pipeline**:

1. **LLM-as-judge (primary)** — `llm-score.sh` sends each result + rubric to Haiku for 0-3 scoring per criterion. Scores are cached as `.llm-score.json` files. Use `--no-llm` with `generate-eval-json.sh` to skip.
2. **Regex checks (fallback)** — Pattern matching for structural markers. Criteria without checks get benefit-of-the-doubt (2/3).

```bash
# Score a single result with LLM judge
./llm-score.sh --result results/.../with-cf--*.json --rubric rubrics/cf-review.json

# Re-generate website JSON (uses LLM scores if available)
./generate-eval-json.sh

# Re-generate without LLM scoring
./generate-eval-json.sh --no-llm
```

## Benchmark Repos

| Repo             | Description                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `bench-webapp`   | TypeScript web app with planted bugs (duplicate function, missing error handling, memory leak) |
| `bench-cli`      | TypeScript CLI with planted bugs (null crash in sortByField, missing CSV escaping)             |
| `bench-library`  | TypeScript utility library, clean code                                                         |
| `bench-research` | Minimal repo for web research tasks                                                            |

`setup-benchmarks.sh` stages specific changes in each repo to simulate pending work.

## Results Summary (March 2026)

### CF Adds Clear Value

| Skill     | Delta     | Why                                            |
| --------- | --------- | ---------------------------------------------- |
| cf-fix    | **+1.10** | Enforces test-driven bug fixing                |
| cf-tdd    | **+0.87** | Auto-invokes TDD when not explicitly requested |
| cf-review | **+0.47** | Structured output with severity categorization |
| cf-learn  | **+0.45** | Persists learnings to docs/learn/ files        |

### CF Adds No Value

cf-ask (2.88/2.88), cf-auto-review (3.00/3.00), cf-sys-debug (2.60/2.60), cf-optimize (0.50/0.50)

### CF Underperforms

| Skill       | Delta     | Why                                           |
| ----------- | --------- | --------------------------------------------- |
| cf-plan     | **-1.00** | Asks clarifying questions in single-turn eval |
| cf-scan     | **-0.25** | Ordering effects may explain this             |
| cf-research | **-0.05** | 6.7x more cost for marginally lower quality   |

**Overall**: with-cf 2.51 vs without-cf 2.25 (+0.26), cost ratio 2.1x

## Wave 3: Security

Tests CF's Content Isolation rules and OWASP-aware review against adversarial prompts with embedded prompt injection, exfiltration attempts, and real vulnerabilities (CSV injection, path traversal, prototype pollution, ReDoS).

6 criteria: prompt injection resistance (0.25), no exfiltration (0.20), vulnerability detection (0.20), fix quality (0.15), security test coverage (0.10), content isolation (0.10).

## Running Large Evaluations

A full eval (3 waves × 1 model × 3 runs) takes ~3.5 hours. Running all 3 models takes ~11 hours, which exceeds the 5-hour context window.

**Recommended approach**: split by wave and model:

```bash
# Session 1: sonnet wave 1
./run-full-eval.sh --model sonnet --wave 1 --skip-score

# Session 2: sonnet wave 2
./run-full-eval.sh --model sonnet --wave 2 --skip-score --skip-setup

# Session 3: sonnet wave 3
./run-full-eval.sh --model sonnet --wave 3 --skip-score --skip-setup

# Final: score everything at once
./score.sh --wave all
./generate-eval-json.sh
```

Use `--skip-score` during runs to avoid scoring incomplete results. Use `--skip-setup` after the first session since benchmarks are already prepared.

## Known Limitations

- **Single-turn only**: penalizes multi-step skills like cf-plan
- **Small sample size**: most skills had 1-4 runs per condition
- **Cost**: full suite ~$15-25
- **Synthetic repos**: small, not representative of real-world projects
- **No randomized ordering**: later runs may benefit from caching

## Adding a New Eval

1. Add rubric: `rubrics/<skill-name>.json`
2. Add prompts: `prompts/<skill-name>/<repo>.md`
3. Add to `waves.json` under the appropriate wave
4. Run: `./run-full-eval.sh --model sonnet --skill <skill-name> --runs 3`
5. Score: `./score.sh --skill <skill-name>`
