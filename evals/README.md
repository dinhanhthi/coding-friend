# Coding Friend Evaluation Framework

Controlled A/B tests measuring whether the Coding Friend plugin improves Claude Code's output quality. Same prompts, same benchmark repos, with-cf vs without-cf. Scored by an LLM judge against rubrics on a 0-3 scale.

## What We're Actually Testing

The core hypothesis: **CF's workflow orchestration produces better outcomes than bare Claude Code.** CF's skills and agents auto-activate and coordinate — `cf-tdd` enforces RED-GREEN-REFACTOR, `cf-fix` drives test-driven bug fixing, `cf-review` dispatches a dedicated reviewer agent, `cf-auto-review` applies OWASP checklists. Without CF, the default AI may produce correct code but misses the disciplined workflow steps that catch edge cases, enforce test coverage, and structure outputs.

We do **not** measure time or cost — only output quality against rubrics. Scoring uses **LLM-as-judge only** (Claude Haiku evaluating against rubric criteria). No regex, no pattern matching, no automated checks contribute to the final scores.

## Quick Start

Run one wave per session (avoids context window limits), then generate scores:

```bash
# Session 1: run wave 1 only (no scoring yet)
./run-full-eval.sh --model sonnet --wave 1 --skip-score

# Session 2: run wave 2 only
./run-full-eval.sh --model sonnet --wave 2 --skip-score --skip-setup

# Session 3: run wave 3 only
./run-full-eval.sh --model sonnet --wave 3 --skip-score --skip-setup

# Session 4: generate final scores from all collected results
./generate-eval-json.sh --no-budget
./generate-eval-json.sh --model sonnet --no-budget
```

⚠️ Be careful not to run multiple waves in parallel. Shared `.plugin-state.tmp` and benchmark repos cause race conditions. Run sequentially with `&&` instead.

Other common patterns:

```bash
# Run all waves at once for a single model (runs=3)
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

Options for `run-full-eval.sh`:

| Option              | Default                   | Description                                           |
| ------------------- | ------------------------- | ----------------------------------------------------- |
| `--model <name>`    | all (haiku, sonnet, opus) | Model to use. Repeat for multiple.                    |
| `--runs <N>`        | 3                         | Runs per combination                                  |
| `--wave <N>`        | all                       | Wave to run: `1`, `2`, `3`, `security` (=3), or `all` |
| `--skill <name>`    |                           | Run only this skill                                   |
| `--budget <amount>` |                           | Max cost per run in USD                               |
| `--dry-run`         |                           | Preview all runs without executing                    |
| `--skip-setup`      |                           | Skip benchmark repo setup                             |
| `--skip-score`      |                           | Skip scoring and JSON generation                      |

## Output Structure

```
results/<date>/<model>/wave-<N>/<skill>/<bench-repo>/
  ├── <condition>--<timestamp>.json              # raw Claude output (final result)
  ├── <condition>--<timestamp>.meta.json         # metadata (wall time, model — not used in scoring)
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
  ├── 📜 setup-benchmarks.sh                     (prepare benchmark repos)
  ├── for each model (haiku, sonnet, opus):
  │   └── 📜 run-wave.sh × N waves              <- one model, one wave
  │       └── for each skill × repo × condition:
  │           └── 📜 run-eval.sh                <- single eval run (claude -p → capture output)
  │               └── results/<date>/<model>/wave-<N>/<skill>/<bench-repo>/
  │                     ├── <condition>--<timestamp>.json              (raw result)
  │                     ├── <condition>--<timestamp>.meta.json         (metadata)
  │                     └── <condition>--<timestamp>.conversation.txt  (conversation log)
  ├── 📜 score.sh --wave all                     (diagnostic regex checks, NOT used for final scores)
  │   └── analysis/<date>/<model>/wave-<N>/<skill>-<bench-repo>-<condition>-scores.json
  └── 📜 generate-eval-json.sh                   (LLM-as-judge scoring → website data)
      ├── for each model × skill × condition:
      │   └── 📜 llm-score.sh                   <- scores one result file against its rubric
      │       ├── reads: result .json + rubric + conversation .txt
      │       ├── calls claude (Haiku) with rubric criteria for 0-3 scoring
      │       └── caches: <condition>--<timestamp>.llm-score.json  (skipped on re-runs)
      └── website/src/data/eval-results.json  (aggregated website data)
```

## Lower-Level Scripts

Rarely needed directly -- `run-full-eval.sh` calls these automatically.

| Script                                                                      | When to use                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------- |
| `run-wave.sh --wave 1 --model sonnet --runs 3`                              | Run a specific wave with a specific model      |
| `run-eval.sh --prompt ... --condition with-cf --skill cf-review --repo ...` | Debug a single prompt or test a rubric change  |
| `score.sh --wave all`                                                       | Diagnostic regex checks (not used for website) |
| `generate-eval-json.sh [--no-budget] [--model <name>]`                      | Re-generate website JSON from existing results |
| `llm-score.sh --result <path> --rubric <path> [--no-budget]`                | Score a single result file with LLM judge      |
| `setup-benchmarks.sh`                                                       | Manually prepare benchmark repos               |

## A/B Test Design

| Condition    | How it works                                                                             |
| ------------ | ---------------------------------------------------------------------------------------- |
| `with-cf`    | Normal mode -- Coding Friend plugin loaded with all skills, agents, and auto-invocations |
| `without-cf` | Bare mode -- `--disable-slash-commands`, all plugins disabled                            |

Each run: repo reset -> claude -p -> capture JSON -> repo reset. Uses `--no-session-persistence` for isolation.

## Scoring

Each skill has a rubric (`rubrics/<skill>.json`) with weighted criteria scored 0-3. Pass threshold: **2.0**.

**LLM-as-judge scoring only** — `llm-score.sh` sends each result + rubric to Claude Haiku for 0-3 scoring per criterion. The judge evaluates both the **final output** and the **full conversation log**, which is critical for with-CF results where workflow discipline (skill activations, agent dispatches, TDD cycles) happens mid-conversation, not just in the final summary.

Scores are cached as `.llm-score.json` files so re-runs are instant. There are no regex-based or pattern-matching scores in the final results — `score.sh` exists as a diagnostic tool only and does not contribute to website data.

**No time or cost metrics** — scoring focuses exclusively on output quality. Time and cost are captured in `.meta.json` for reference but are not part of the evaluation scores.

```bash
# Score a single result with LLM judge (default: $0.05 budget limit per call)
./llm-score.sh --result results/.../with-cf--*.json --rubric rubrics/cf-review.json

# Score without budget limit (for Claude Code subscription users)
./llm-score.sh --result results/.../with-cf--*.json --rubric rubrics/cf-review.json --no-budget

# Re-generate website JSON (uses cached scores, generates missing ones)
./generate-eval-json.sh

# Re-generate without budget limit (for Claude Code subscription users)
./generate-eval-json.sh --no-budget
```

## Benchmark Repos

| Repo             | Description                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `bench-webapp`   | TypeScript web app with planted bugs (duplicate function, missing error handling, memory leak) |
| `bench-cli`      | TypeScript CLI with planted bugs (null crash in sortByField, missing CSV escaping)             |
| `bench-library`  | TypeScript utility library, clean code                                                         |
| `bench-research` | Minimal repo for web research tasks                                                            |

`setup-benchmarks.sh` stages specific changes in each repo to simulate pending work.

## Wave 3: Security

Tests CF's Content Isolation rules and OWASP-aware review against adversarial prompts with embedded prompt injection, exfiltration attempts, and real vulnerabilities (CSV injection, path traversal, prototype pollution, ReDoS).

6 criteria: prompt injection resistance (0.25), no exfiltration (0.20), vulnerability detection (0.20), fix quality (0.15), security test coverage (0.10), content isolation (0.10).

## Running Large Evaluations

A full eval (3 waves × 1 model × 3 runs) takes ~3.5 hours. Running all 3 models takes ~11 hours, which exceeds the 5-hour context window.

**Recommended approach**: split by wave, then generate scores once at the end:

```bash
# Session 1: run wave 1
./run-full-eval.sh --model sonnet --wave 1 --skip-score

# Session 2: run wave 2
./run-full-eval.sh --model sonnet --wave 2 --skip-score --skip-setup

# Session 3: run wave 3
./run-full-eval.sh --model sonnet --wave 3 --skip-score --skip-setup

# Final: generate LLM-as-judge scores from all results
./generate-eval-json.sh --no-budget
```

- `--skip-score` avoids scoring incomplete results (wait until all waves are done)
- `--skip-setup` reuses benchmark repos prepared in session 1
- `generate-eval-json.sh` scores all results using LLM-as-judge and writes the website JSON
- `--no-budget` to ignore the budget limit for llm scoring (useful when you use Claude subscription)

## Known Limitations

- **Single-turn only**: penalizes multi-step skills (cf-plan excluded for this reason)
- **Small sample size**: most skills had 1-4 runs per condition
- **Synthetic repos**: small, not representative of real-world projects
- **No randomized ordering**: later runs may benefit from caching
- **No time/cost comparison**: we intentionally exclude these — workflow quality matters more than speed
- **No concurrent waves**: do NOT run multiple waves in parallel (e.g., `--wave 2` and `--wave 3` simultaneously). Shared `.plugin-state.tmp` and benchmark repos cause race conditions. Run sequentially with `&&` instead

## Adding a New Eval

1. Add rubric: `rubrics/<skill-name>.json` — criteria should focus on what the CF workflow adds (e.g., TDD discipline, structured output, agent dispatch) vs what bare Claude typically misses
2. Add prompts: `prompts/<skill-name>/<repo>.md` — prompts should be task-oriented (not "use TDD"), so CF's auto-activation is what's being tested
3. Add to `waves.json` under the appropriate wave
4. Run: `./run-full-eval.sh --model sonnet --skill <skill-name> --runs 3`
5. Re-generate scores: `./generate-eval-json.sh`
