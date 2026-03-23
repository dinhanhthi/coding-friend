#!/usr/bin/env bash
# run-full-eval.sh — Run a complete A-Z evaluation across all waves and models
#
# This is the single command to run everything: setup benchmarks, run all waves
# for each model (haiku, sonnet, opus), score results, and generate the website
# JSON data file.
#
# Usage:
#   ./run-full-eval.sh                        # Run all models, 3 runs each
#   ./run-full-eval.sh --model sonnet         # Run only sonnet
#   ./run-full-eval.sh --runs 1               # Quick run (1 per combo)
#   ./run-full-eval.sh --wave 1               # Only wave 1
#   ./run-full-eval.sh --wave security        # Only security wave
#   ./run-full-eval.sh --dry-run              # Preview without executing
#   ./run-full-eval.sh --skip-setup           # Skip benchmark setup
#   ./run-full-eval.sh --skip-score           # Skip scoring step
#   ./run-full-eval.sh --budget 0.50          # Budget cap per run in USD

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Defaults
MODELS=("haiku" "sonnet" "opus")
RUNS=3
WAVE="all"
DRY_RUN=false
SKIP_SETUP=false
SKIP_SCORE=false
BUDGET=""
SKILL_FILTER=""

usage() {
  cat <<'USAGE'
run-full-eval.sh — Run a complete A-Z evaluation across all waves and models

Usage:
  ./run-full-eval.sh [options]

Options:
  --model <name>     Run only this model (haiku, sonnet, opus). Repeat for multiple.
  --runs <N>         Number of runs per combination (default: 3)
  --wave <1|2|3|security|all>  Which wave(s) to run (default: all)
  --skill <name>     Run only this skill
  --budget <amount>  Max budget in USD per run
  --dry-run          Show what would be executed without running
  --skip-setup       Skip benchmark repo setup
  --skip-score       Skip scoring and JSON generation
  --help             Show this help message

Examples:
  ./run-full-eval.sh                             # Full eval, all models, 3 runs
  ./run-full-eval.sh --model sonnet --runs 1     # Quick sonnet eval
  ./run-full-eval.sh --wave security --runs 3    # Only security wave
  ./run-full-eval.sh --dry-run                   # Preview all runs
USAGE
}

die() {
  echo "ERROR: $1" >&2
  exit 1
}

# Parse arguments
CUSTOM_MODELS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model)
      CUSTOM_MODELS+=("$2"); shift 2 ;;
    --runs)
      RUNS="$2"; shift 2 ;;
    --wave)
      WAVE="$2"; shift 2 ;;
    --skill)
      SKILL_FILTER="$2"; shift 2 ;;
    --budget)
      BUDGET="$2"; shift 2 ;;
    --dry-run)
      DRY_RUN=true; shift ;;
    --skip-setup)
      SKIP_SETUP=true; shift ;;
    --skip-score)
      SKIP_SCORE=true; shift ;;
    --help)
      usage; exit 0 ;;
    *)
      die "Unknown argument: $1" ;;
  esac
done

if [[ ${#CUSTOM_MODELS[@]} -gt 0 ]]; then
  MODELS=("${CUSTOM_MODELS[@]}")
fi

# Map wave arg to run-wave.sh format
WAVE_ARGS=()
case "$WAVE" in
  1|2)       WAVE_ARGS=("$WAVE") ;;
  3|security) WAVE_ARGS=("3") ;;
  all)       WAVE_ARGS=("1" "2" "3") ;;
  *)         die "Invalid wave: $WAVE (must be 1, 2, 3, security, or all)" ;;
esac

# Calculate total runs for summary
calc_total() {
  local total=0
  for wave_num in "${WAVE_ARGS[@]}"; do
    local wave_key="wave${wave_num}"
    local skill_count
    if [[ -n "$SKILL_FILTER" ]]; then
      skill_count=$(jq -r ".${wave_key}.skills | keys[] | select(. == \"$SKILL_FILTER\")" "$SCRIPT_DIR/waves.json" 2>/dev/null | wc -l | tr -d ' ')
    else
      skill_count=$(jq -r ".${wave_key}.skills | keys | length" "$SCRIPT_DIR/waves.json" 2>/dev/null || echo 0)
    fi
    local repo_count
    if [[ -n "$SKILL_FILTER" ]]; then
      repo_count=$(jq -r ".${wave_key}.skills[\"$SKILL_FILTER\"].repos | length" "$SCRIPT_DIR/waves.json" 2>/dev/null || echo 0)
    else
      repo_count=$(jq '[.'"${wave_key}"'.skills[].repos | length] | add' "$SCRIPT_DIR/waves.json" 2>/dev/null || echo 0)
    fi
    # Each skill×repo × 2 conditions × N runs × M models
    total=$((total + repo_count * 2 * RUNS))
  done
  echo $((total * ${#MODELS[@]}))
}

TOTAL_RUNS=$(calc_total)

echo "=========================================="
echo "  CODING FRIEND — Full Evaluation Suite"
echo "=========================================="
echo ""
echo "  Models:  ${MODELS[*]}"
echo "  Waves:   ${WAVE_ARGS[*]}"
echo "  Runs:    $RUNS per combination"
echo "  Total:   ~$TOTAL_RUNS eval runs"
[[ -n "$SKILL_FILTER" ]] && echo "  Skill:   $SKILL_FILTER"
[[ -n "$BUDGET" ]] && echo "  Budget:  \$$BUDGET per run"
echo ""

if [[ "$DRY_RUN" == true ]]; then
  echo "[DRY RUN] Would execute:"
  echo ""
  for model in "${MODELS[@]}"; do
    for wave_num in "${WAVE_ARGS[@]}"; do
      local_args=(--wave "$wave_num" --runs "$RUNS" --model "$model" --dry-run)
      [[ -n "$SKILL_FILTER" ]] && local_args+=(--skill "$SKILL_FILTER")
      echo "--- $model / wave $wave_num ---"
      "$SCRIPT_DIR/run-wave.sh" "${local_args[@]}" 2>/dev/null || true
      echo ""
    done
  done
  echo "[DRY RUN] After runs: score.sh + generate-eval-json.sh"
  exit 0
fi

# Step 1: Setup benchmarks
if [[ "$SKIP_SETUP" == false ]]; then
  echo "=== Step 1: Setting up benchmarks ==="
  "$SCRIPT_DIR/setup-benchmarks.sh"
  echo ""
else
  echo "=== Step 1: Skipped (--skip-setup) ==="
  echo ""
fi

# Step 2: Run evals for each model
START_TIME=$(date +%s)
TOTAL_ERRORS=0
MODEL_IDX=0

for model in "${MODELS[@]}"; do
  MODEL_IDX=$((MODEL_IDX + 1))
  echo "=========================================="
  echo "  Model $MODEL_IDX/${#MODELS[@]}: $model"
  echo "=========================================="
  echo ""

  for wave_num in "${WAVE_ARGS[@]}"; do
    echo "--- Wave $wave_num ---"
    RUN_CMD=("$SCRIPT_DIR/run-wave.sh"
      --wave "$wave_num"
      --runs "$RUNS"
      --model "$model"
    )
    [[ -n "$SKILL_FILTER" ]] && RUN_CMD+=(--skill "$SKILL_FILTER")

    if "${RUN_CMD[@]}"; then
      echo "  Wave $wave_num complete for $model"
    else
      echo "  Wave $wave_num had errors for $model" >&2
      TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
    echo ""
  done
done

END_TIME=$(date +%s)
WALL_TIME=$((END_TIME - START_TIME))

# Step 3: Score results
if [[ "$SKIP_SCORE" == false ]]; then
  echo "=== Step 3: Scoring results ==="
  for wave_num in "${WAVE_ARGS[@]}"; do
    echo "--- Scoring wave $wave_num ---"
    "$SCRIPT_DIR/score.sh" --wave "$wave_num" || true
    echo ""
  done

  # Step 4: Generate website JSON
  echo "=== Step 4: Generating website data ==="
  "$SCRIPT_DIR/generate-eval-json.sh"
  echo ""
else
  echo "=== Step 3-4: Skipped (--skip-score) ==="
  echo ""
fi

# Summary
HOURS=$((WALL_TIME / 3600))
MINUTES=$(( (WALL_TIME % 3600) / 60 ))
SECONDS=$((WALL_TIME % 60))

echo "=========================================="
echo "  COMPLETE"
echo "=========================================="
echo ""
echo "  Duration:  ${HOURS}h ${MINUTES}m ${SECONDS}s"
echo "  Models:    ${MODELS[*]}"
echo "  Errors:    $TOTAL_ERRORS"
echo "  Results:   $SCRIPT_DIR/results/"
echo "  Scores:    $SCRIPT_DIR/analysis/"
echo "  Website:   website/src/data/eval-results.json"
echo ""
if [[ $TOTAL_ERRORS -gt 0 ]]; then
  echo "  WARNING: $TOTAL_ERRORS wave(s) had errors. Check logs above."
fi
