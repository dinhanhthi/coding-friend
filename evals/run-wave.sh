#!/usr/bin/env bash
# run-wave.sh — Run a wave of evals across skills, repos, and conditions
#
# Middle-level script: runs all skill×repo×condition combinations for a single
# wave with a single model. Use run-full-eval.sh to orchestrate across multiple
# models and waves automatically.
#
# Usage:
#   ./run-wave.sh --wave <1|2|3|security|all> [--runs N] [--model MODEL] [--skill NAME] [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color
WAVES_FILE="$SCRIPT_DIR/waves.json"
BENCHMARKS_DIR="$SCRIPT_DIR/benchmarks"

# Defaults
WAVE=""
RUNS=3
MODEL="sonnet"
SKILL_FILTER=""
DRY_RUN=false

usage() {
  cat <<'USAGE'
run-wave.sh — Run a wave of evals across skills, repos, and conditions

Usage:
  ./run-wave.sh --wave <1|2|all> [options]

Options:
  --wave <1|2|all>   Wave to run (required)
  --runs <N>         Number of runs per combination (default: 3)
  --model <model>    Model to use (default: sonnet)
  --skill <name>     Run only this skill from the wave
  --dry-run          Show what would be executed without running
  --help             Show this help message
USAGE
}

die() {
  echo -e "${RED}❌ ERROR: $1${NC}" >&2
  exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --wave)   WAVE="$2"; shift 2 ;;
    --runs)   RUNS="$2"; shift 2 ;;
    --model)  MODEL="$2"; shift 2 ;;
    --skill)  SKILL_FILTER="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help)   usage; exit 0 ;;
    *)        die "Unknown argument: $1" ;;
  esac
done

[[ -z "$WAVE" ]] && die "Missing required argument: --wave"
[[ ! -f "$WAVES_FILE" ]] && die "waves.json not found at $WAVES_FILE"

# Determine which wave keys to process
case "$WAVE" in
  1)        WAVE_KEYS=("wave1") ;;
  2)        WAVE_KEYS=("wave2") ;;
  3|security) WAVE_KEYS=("wave3") ;;
  all)      WAVE_KEYS=("wave1" "wave2" "wave3") ;;
  *)        die "Invalid wave: $WAVE (must be 1, 2, 3, security, or all)" ;;
esac

# Collect all run combinations
COMBINATIONS=()
for wave_key in "${WAVE_KEYS[@]}"; do
  # Get skill names for this wave
  SKILLS=$(jq -r ".${wave_key}.skills | keys[]" "$WAVES_FILE")

  for skill in $SKILLS; do
    # Apply skill filter if set
    if [[ -n "$SKILL_FILTER" && "$skill" != "$SKILL_FILTER" ]]; then
      continue
    fi

    # Get repos for this skill
    REPOS=$(jq -r ".${wave_key}.skills[\"$skill\"].repos[]" "$WAVES_FILE")

    for repo in $REPOS; do
      REPO_PATH="$BENCHMARKS_DIR/$repo"
      PROMPT_FILE="$SCRIPT_DIR/prompts/${skill}/${repo}.md"

      for condition in with-cf without-cf; do
        for run_num in $(seq 1 "$RUNS"); do
          COMBINATIONS+=("$skill|$repo|$condition|$run_num|$REPO_PATH|$PROMPT_FILE|$wave_key")
        done
      done
    done
  done
done

TOTAL=${#COMBINATIONS[@]}

if [[ "$DRY_RUN" == true ]]; then
  echo -e "${CYAN}🔍 === Dry Run: $TOTAL total runs ===${NC}"
  echo ""
  local_idx=0
  for combo in "${COMBINATIONS[@]}"; do
    IFS='|' read -r skill repo condition run_num repo_path prompt_file wave_key <<< "$combo"
    wave_num="${wave_key#wave}"
    local_idx=$((local_idx + 1))
    if [[ "$wave_num" == "3" ]]; then
      echo -e "  ${DIM}[$local_idx/$TOTAL]${NC} scenario ${BOLD}$skill${NC} $condition on ${BLUE}$repo${NC} ${DIM}(wave $wave_num, run $run_num/$RUNS)${NC}"
    else
      echo -e "  ${DIM}[$local_idx/$TOTAL]${NC} ${BOLD}$skill${NC} $condition on ${BLUE}$repo${NC} ${DIM}(wave $wave_num, run $run_num/$RUNS)${NC}"
    fi
  done
  echo ""
  echo -e "  📊 total=${BOLD}$TOTAL${NC} runs=${BOLD}$RUNS${NC} model=${BOLD}$MODEL${NC}"
  exit 0
fi

# Execute runs
echo -e "${BOLD}🚀 === Running $TOTAL eval runs ===${NC}"
echo ""

IDX=0
ERRORS=0
for combo in "${COMBINATIONS[@]}"; do
  IFS='|' read -r skill repo condition run_num repo_path prompt_file wave_key <<< "$combo"
  WAVE_NUM="${wave_key#wave}"
  IDX=$((IDX + 1))

  if [[ "$WAVE_NUM" == "3" ]]; then
    echo -e "${BLUE}▶ [$IDX/$TOTAL]${NC} Running scenario ${BOLD}$skill${NC} $condition on ${CYAN}$repo${NC} ${DIM}(wave $WAVE_NUM, run $run_num/$RUNS)${NC}..."
  else
    echo -e "${BLUE}▶ [$IDX/$TOTAL]${NC} Running ${BOLD}$skill${NC} $condition on ${CYAN}$repo${NC} ${DIM}(wave $WAVE_NUM, run $run_num/$RUNS)${NC}..."
  fi

  # Check that repo and prompt exist
  if [[ ! -d "$repo_path" ]]; then
    echo -e "  ${YELLOW}⏭ SKIP: benchmark repo not found at $repo_path${NC}" >&2
    continue
  fi
  if [[ ! -f "$prompt_file" ]]; then
    echo -e "  ${YELLOW}⏭ SKIP: prompt file not found at $prompt_file${NC}" >&2
    continue
  fi

  # Build run-eval.sh command
  RUN_CMD=("$SCRIPT_DIR/run-eval.sh"
    --prompt "$prompt_file"
    --condition "$condition"
    --skill "$skill"
    --repo "$repo_path"
    --model "$MODEL"
    --wave "$WAVE_NUM"
    --bench-repo "$repo"
  )

  if "${RUN_CMD[@]}"; then
    echo -e "  ${GREEN}✔ OK${NC}"
  else
    echo -e "  ${RED}✘ FAILED (continuing)${NC}" >&2
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}🎉 === Complete: $((IDX - ERRORS))/$IDX succeeded, 0 errors ===${NC}"
else
  echo -e "${YELLOW}⚠️  === Complete: $((IDX - ERRORS))/$IDX succeeded, ${RED}$ERRORS errors${NC}${YELLOW} ===${NC}"
fi
