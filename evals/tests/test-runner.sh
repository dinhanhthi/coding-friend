#!/usr/bin/env bash
# Test runner for eval scripts
# Each test function returns 0 on success, 1 on failure.

set -uo pipefail

EVALS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
ERRORS=()

run_test() {
  local name="$1"
  if "$name"; then
    PASS=$((PASS + 1))
    echo "  PASS: $name"
  else
    FAIL=$((FAIL + 1))
    ERRORS+=("$name")
    echo "  FAIL: $name"
  fi
}

assert_eq() {
  local expected="$1" actual="$2" msg="${3:-}"
  if [[ "$expected" != "$actual" ]]; then
    echo "    Expected: $expected"
    echo "    Actual:   $actual"
    [[ -n "$msg" ]] && echo "    Message:  $msg"
    return 1
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" msg="${3:-}"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "    Expected to contain: $needle"
    echo "    In: ${haystack:0:200}"
    [[ -n "$msg" ]] && echo "    Message:  $msg"
    return 1
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2" msg="${3:-}"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "    Should NOT contain: $needle"
    [[ -n "$msg" ]] && echo "    Message:  $msg"
    return 1
  fi
}

assert_file_exists() {
  local path="$1" msg="${2:-}"
  if [[ ! -f "$path" ]]; then
    echo "    File does not exist: $path"
    [[ -n "$msg" ]] && echo "    Message:  $msg"
    return 1
  fi
}

# ============================================================
# waves.json tests
# ============================================================

test_waves_json_exists() {
  assert_file_exists "$EVALS_DIR/waves.json"
}

test_waves_json_valid() {
  jq empty "$EVALS_DIR/waves.json" 2>/dev/null
}

test_waves_json_has_wave1() {
  local result
  result=$(jq -r '.wave1 | type' "$EVALS_DIR/waves.json" 2>/dev/null)
  assert_eq "object" "$result" "wave1 should be an object"
}

test_waves_json_has_wave2() {
  local result
  result=$(jq -r '.wave2 | type' "$EVALS_DIR/waves.json" 2>/dev/null)
  assert_eq "object" "$result" "wave2 should be an object"
}

test_waves_json_wave1_has_skills() {
  local count
  count=$(jq '.wave1.skills | keys | length' "$EVALS_DIR/waves.json" 2>/dev/null)
  assert_eq "5" "$count" "wave1 should have 5 skills"
}

test_waves_json_wave2_has_skills() {
  local count
  count=$(jq '.wave2.skills | keys | length' "$EVALS_DIR/waves.json" 2>/dev/null)
  assert_eq "12" "$count" "wave2 should have 12 skills"
}

test_waves_json_skill_has_repos() {
  local count
  count=$(jq '.wave1.skills["cf-commit"].repos | length' "$EVALS_DIR/waves.json" 2>/dev/null)
  assert_eq "3" "$count" "cf-commit should have 3 repos"
}

# ============================================================
# run-eval.sh tests
# ============================================================

test_run_eval_exists() {
  assert_file_exists "$EVALS_DIR/run-eval.sh"
}

test_run_eval_executable() {
  [[ -x "$EVALS_DIR/run-eval.sh" ]] || { echo "    run-eval.sh is not executable"; return 1; }
}

test_run_eval_help() {
  local output
  output=$("$EVALS_DIR/run-eval.sh" --help 2>&1) || true
  assert_contains "$output" "--prompt" || return 1
  assert_contains "$output" "--condition" || return 1
  assert_contains "$output" "--skill" || return 1
  assert_contains "$output" "--repo" || return 1
  assert_contains "$output" "--model" || return 1
}

test_run_eval_missing_args() {
  local exit_code=0
  "$EVALS_DIR/run-eval.sh" 2>/dev/null || exit_code=$?
  assert_eq "1" "$exit_code" "should fail with exit code 1 when no args provided"
}

test_run_eval_invalid_condition() {
  local exit_code=0
  "$EVALS_DIR/run-eval.sh" --prompt /dev/null --condition invalid --skill test --repo /tmp 2>/dev/null || exit_code=$?
  assert_eq "1" "$exit_code" "should fail with invalid condition"
}

test_run_eval_dry_run_without_cf() {
  local output
  output=$("$EVALS_DIR/run-eval.sh" \
    --prompt /dev/null \
    --condition without-cf \
    --skill test-skill \
    --repo /tmp \
    --model sonnet \
    --dry-run 2>&1) || true
  assert_contains "$output" "--bare" "without-cf should use --bare flag" || return 1
  assert_contains "$output" "--output-format json" || return 1
  assert_contains "$output" "--dangerously-skip-permissions" || return 1
}

test_run_eval_dry_run_with_cf() {
  local output
  output=$("$EVALS_DIR/run-eval.sh" \
    --prompt /dev/null \
    --condition with-cf \
    --skill test-skill \
    --repo /tmp \
    --model sonnet \
    --dry-run 2>&1) || true
  assert_not_contains "$output" "--bare" "with-cf should NOT use --bare flag" || return 1
  assert_contains "$output" "--output-format json" || return 1
  assert_contains "$output" "--dangerously-skip-permissions" || return 1
}

test_run_eval_default_model() {
  local output
  output=$("$EVALS_DIR/run-eval.sh" \
    --prompt /dev/null \
    --condition with-cf \
    --skill test-skill \
    --repo /tmp \
    --dry-run 2>&1) || true
  assert_contains "$output" "--model sonnet" "default model should be sonnet"
}

test_run_eval_custom_model() {
  local output
  output=$("$EVALS_DIR/run-eval.sh" \
    --prompt /dev/null \
    --condition with-cf \
    --skill test-skill \
    --repo /tmp \
    --model opus \
    --dry-run 2>&1) || true
  assert_contains "$output" "--model opus"
}

test_run_eval_output_path_structure() {
  local output
  output=$("$EVALS_DIR/run-eval.sh" \
    --prompt /dev/null \
    --condition with-cf \
    --skill cf-commit \
    --repo /tmp \
    --dry-run 2>&1) || true
  assert_contains "$output" "results/cf-commit/with-cf/"
}

test_run_eval_budget_flag() {
  local output
  output=$("$EVALS_DIR/run-eval.sh" \
    --prompt /dev/null \
    --condition with-cf \
    --skill test-skill \
    --repo /tmp \
    --budget 5.00 \
    --dry-run 2>&1) || true
  assert_contains "$output" "--max-budget-usd 5.00"
}

# ============================================================
# run-wave.sh tests
# ============================================================

test_run_wave_exists() {
  assert_file_exists "$EVALS_DIR/run-wave.sh"
}

test_run_wave_executable() {
  [[ -x "$EVALS_DIR/run-wave.sh" ]] || { echo "    run-wave.sh is not executable"; return 1; }
}

test_run_wave_help() {
  local output
  output=$("$EVALS_DIR/run-wave.sh" --help 2>&1) || true
  assert_contains "$output" "--wave" || return 1
  assert_contains "$output" "--runs" || return 1
  assert_contains "$output" "--dry-run" || return 1
}

test_run_wave_dry_run_wave1() {
  local output
  output=$("$EVALS_DIR/run-wave.sh" --wave 1 --dry-run 2>&1) || true
  assert_contains "$output" "cf-commit" || return 1
  assert_contains "$output" "with-cf" || return 1
  assert_contains "$output" "without-cf" || return 1
}

test_run_wave_dry_run_shows_count() {
  local output
  output=$("$EVALS_DIR/run-wave.sh" --wave 1 --runs 2 --dry-run 2>&1) || true
  assert_contains "$output" "total" || return 1
}

test_run_wave_skill_filter() {
  local output
  output=$("$EVALS_DIR/run-wave.sh" --wave 1 --skill cf-commit --dry-run 2>&1) || true
  assert_contains "$output" "cf-commit" || return 1
  assert_not_contains "$output" "cf-review" "skill filter should exclude cf-review" || return 1
}

test_run_wave_all() {
  local output
  output=$("$EVALS_DIR/run-wave.sh" --wave all --dry-run 2>&1) || true
  assert_contains "$output" "cf-commit" || return 1
  assert_contains "$output" "cf-optimize" || return 1
}

# ============================================================
# score.sh tests
# ============================================================

test_score_exists() {
  assert_file_exists "$EVALS_DIR/score.sh"
}

test_score_executable() {
  [[ -x "$EVALS_DIR/score.sh" ]] || { echo "    score.sh is not executable"; return 1; }
}

test_score_help() {
  local output
  output=$("$EVALS_DIR/score.sh" --help 2>&1) || true
  assert_contains "$output" "--skill" || return 1
  assert_contains "$output" "--wave" || return 1
}

test_score_rubric_exists_cf_commit() {
  assert_file_exists "$EVALS_DIR/rubrics/cf-commit.json"
}

test_score_rubric_valid_cf_commit() {
  jq empty "$EVALS_DIR/rubrics/cf-commit.json" 2>/dev/null
}

test_score_rubric_has_criteria() {
  local count
  count=$(jq '.criteria | length' "$EVALS_DIR/rubrics/cf-commit.json" 2>/dev/null)
  [[ "$count" -gt 0 ]] || { echo "    cf-commit rubric should have at least 1 criterion"; return 1; }
}

test_score_with_fixture() {
  # Create a fixture result to score
  local fixture_dir="$EVALS_DIR/tests/fixtures/results/cf-commit/with-cf"
  mkdir -p "$fixture_dir"
  cat > "$fixture_dir/test-fixture.json" <<'FIXTURE'
{
  "result": "feat(auth): add OAuth2 login flow\n\nImplement Google OAuth2 authentication with session management.",
  "cost_usd": 0.05,
  "duration_ms": 12000,
  "num_turns": 3
}
FIXTURE

  local output exit_code=0
  output=$("$EVALS_DIR/score.sh" --skill cf-commit --results-dir "$EVALS_DIR/tests/fixtures/results" 2>&1) || exit_code=$?

  # Clean up
  rm -rf "$EVALS_DIR/tests/fixtures"

  assert_contains "$output" "cf-commit" || return 1
}

# ============================================================
# README.md test
# ============================================================

test_readme_exists() {
  assert_file_exists "$EVALS_DIR/README.md"
}

# ============================================================
# Run all tests
# ============================================================

main() {
  echo ""
  echo "=== Eval Runner Tests ==="
  echo ""

  echo "--- waves.json ---"
  run_test test_waves_json_exists
  run_test test_waves_json_valid
  run_test test_waves_json_has_wave1
  run_test test_waves_json_has_wave2
  run_test test_waves_json_wave1_has_skills
  run_test test_waves_json_wave2_has_skills
  run_test test_waves_json_skill_has_repos

  echo ""
  echo "--- run-eval.sh ---"
  run_test test_run_eval_exists
  run_test test_run_eval_executable
  run_test test_run_eval_help
  run_test test_run_eval_missing_args
  run_test test_run_eval_invalid_condition
  run_test test_run_eval_dry_run_without_cf
  run_test test_run_eval_dry_run_with_cf
  run_test test_run_eval_default_model
  run_test test_run_eval_custom_model
  run_test test_run_eval_output_path_structure
  run_test test_run_eval_budget_flag

  echo ""
  echo "--- run-wave.sh ---"
  run_test test_run_wave_exists
  run_test test_run_wave_executable
  run_test test_run_wave_help
  run_test test_run_wave_dry_run_wave1
  run_test test_run_wave_dry_run_shows_count
  run_test test_run_wave_skill_filter
  run_test test_run_wave_all

  echo ""
  echo "--- score.sh ---"
  run_test test_score_exists
  run_test test_score_executable
  run_test test_score_help
  run_test test_score_rubric_exists_cf_commit
  run_test test_score_rubric_valid_cf_commit
  run_test test_score_rubric_has_criteria
  run_test test_score_with_fixture

  echo ""
  echo "--- README ---"
  run_test test_readme_exists

  echo ""
  echo "=== Results: $PASS passed, $FAIL failed ==="
  if [[ ${#ERRORS[@]} -gt 0 ]]; then
    echo "Failed tests:"
    for err in "${ERRORS[@]}"; do
      echo "  - $err"
    done
    return 1
  fi
}

main
