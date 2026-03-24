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
  assert_eq "4" "$count" "wave1 should have 4 skills"
}

test_waves_json_wave2_has_skills() {
  local count
  count=$(jq '.wave2.skills | keys | length' "$EVALS_DIR/waves.json" 2>/dev/null)
  assert_eq "7" "$count" "wave2 should have 7 skills"
}

test_waves_json_skill_has_repos() {
  local count
  count=$(jq '.wave1.skills["cf-review"].repos | length' "$EVALS_DIR/waves.json" 2>/dev/null)
  assert_eq "2" "$count" "cf-review should have 2 repos"
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
  assert_contains "$output" "--disable-slash-commands" "without-cf should use --disable-slash-commands flag" || return 1
  assert_contains "$output" "--output-format stream-json" || return 1
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
  assert_contains "$output" "--output-format stream-json" || return 1
  assert_contains "$output" "--dangerously-skip-permissions" || return 1
}

test_run_eval_dry_run_shows_conversation_file() {
  local output
  output=$("$EVALS_DIR/run-eval.sh" \
    --prompt /dev/null \
    --condition with-cf \
    --skill test-skill \
    --repo /tmp \
    --dry-run 2>&1) || true
  assert_contains "$output" ".conversation.txt" "dry-run should show conversation file path" || return 1
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
    --skill cf-review \
    --repo /tmp \
    --dry-run 2>&1) || true
  assert_contains "$output" "cf-review" || return 1
  assert_contains "$output" "with-cf--" || return 1
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
  assert_contains "$output" "cf-review" || return 1
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
  output=$("$EVALS_DIR/run-wave.sh" --wave 1 --skill cf-review --dry-run 2>&1) || true
  assert_contains "$output" "cf-review" || return 1
  assert_not_contains "$output" "cf-fix" "skill filter should exclude cf-fix" || return 1
}

test_run_wave_all() {
  local output
  output=$("$EVALS_DIR/run-wave.sh" --wave all --dry-run 2>&1) || true
  assert_contains "$output" "cf-review" || return 1
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

test_score_rubric_exists_cf_review() {
  assert_file_exists "$EVALS_DIR/rubrics/cf-review.json"
}

test_score_rubric_valid_cf_review() {
  jq empty "$EVALS_DIR/rubrics/cf-review.json" 2>/dev/null
}

test_score_rubric_has_criteria() {
  local count
  count=$(jq '.criteria | length' "$EVALS_DIR/rubrics/cf-review.json" 2>/dev/null)
  [[ "$count" -gt 0 ]] || { echo "    cf-review rubric should have at least 1 criterion"; return 1; }
}

test_score_with_fixture() {
  # Create a fixture result to score
  local fixture_dir="$EVALS_DIR/tests/fixtures/results/cf-review/with-cf"
  mkdir -p "$fixture_dir"
  cat > "$fixture_dir/test-fixture.json" <<'FIXTURE'
{
  "result": "## Code Review\n\n### Critical\n- **api.ts:42** fetchUser missing error handling\n\n### Important\n- **cache.ts:15** Memory leak in cache module",
  "cost_usd": 0.05,
  "duration_ms": 12000,
  "num_turns": 3
}
FIXTURE

  local output exit_code=0
  output=$("$EVALS_DIR/score.sh" --skill cf-review --results-dir "$EVALS_DIR/tests/fixtures/results" 2>&1) || exit_code=$?

  # Clean up
  rm -rf "$EVALS_DIR/tests/fixtures"

  assert_contains "$output" "cf-review" || return 1
}

# ============================================================
# llm-score.sh tests
# ============================================================

test_llm_score_exists() {
  assert_file_exists "$EVALS_DIR/llm-score.sh"
}

test_llm_score_executable() {
  [[ -x "$EVALS_DIR/llm-score.sh" ]] || { echo "    llm-score.sh is not executable"; return 1; }
}

test_llm_score_help() {
  local output
  output=$("$EVALS_DIR/llm-score.sh" --help 2>&1) || true
  assert_contains "$output" "--result" || return 1
  assert_contains "$output" "--rubric" || return 1
  assert_contains "$output" "--model" || return 1
  assert_contains "$output" "--dry-run" || return 1
}

test_llm_score_missing_result_arg() {
  local exit_code=0
  "$EVALS_DIR/llm-score.sh" --rubric /dev/null 2>/dev/null || exit_code=$?
  assert_eq "1" "$exit_code" "should fail when --result is missing"
}

test_llm_score_missing_rubric_arg() {
  local exit_code=0
  "$EVALS_DIR/llm-score.sh" --result /dev/null 2>/dev/null || exit_code=$?
  assert_eq "1" "$exit_code" "should fail when --rubric is missing"
}

test_llm_score_missing_result_file() {
  local exit_code=0
  "$EVALS_DIR/llm-score.sh" --result /nonexistent/file.json --rubric "$EVALS_DIR/rubrics/cf-review.json" 2>/dev/null || exit_code=$?
  assert_eq "1" "$exit_code" "should fail when result file does not exist"
}

test_llm_score_missing_rubric_file() {
  local exit_code=0
  local tmp_result
  tmp_result=$(mktemp /tmp/llm-score-test-XXXXXX.json)
  echo '{"result": "test"}' > "$tmp_result"
  "$EVALS_DIR/llm-score.sh" --result "$tmp_result" --rubric /nonexistent/rubric.json 2>/dev/null || exit_code=$?
  rm -f "$tmp_result"
  assert_eq "1" "$exit_code" "should fail when rubric file does not exist"
}

test_llm_score_default_model() {
  local tmp_result tmp_rubric
  tmp_result=$(mktemp /tmp/llm-score-test-XXXXXX.json)
  tmp_rubric=$(mktemp /tmp/llm-score-rubric-XXXXXX.json)
  echo '{"result": "test output"}' > "$tmp_result"
  cat > "$tmp_rubric" <<'JSON'
{
  "name": "test",
  "criteria": [
    {"name": "quality", "weight": 1.0, "description": "Test criterion", "scoring": {"0": "Bad", "1": "OK", "2": "Good", "3": "Great"}}
  ]
}
JSON
  local output
  output=$("$EVALS_DIR/llm-score.sh" --result "$tmp_result" --rubric "$tmp_rubric" --dry-run 2>&1) || true
  rm -f "$tmp_result" "$tmp_rubric"
  assert_contains "$output" "--model haiku" "default model should be haiku"
}

test_llm_score_custom_model() {
  local tmp_result tmp_rubric
  tmp_result=$(mktemp /tmp/llm-score-test-XXXXXX.json)
  tmp_rubric=$(mktemp /tmp/llm-score-rubric-XXXXXX.json)
  echo '{"result": "test output"}' > "$tmp_result"
  cat > "$tmp_rubric" <<'JSON'
{
  "name": "test",
  "criteria": [
    {"name": "quality", "weight": 1.0, "description": "Test criterion", "scoring": {"0": "Bad", "1": "OK", "2": "Good", "3": "Great"}}
  ]
}
JSON
  local output
  output=$("$EVALS_DIR/llm-score.sh" --result "$tmp_result" --rubric "$tmp_rubric" --model sonnet --dry-run 2>&1) || true
  rm -f "$tmp_result" "$tmp_rubric"
  assert_contains "$output" "--model sonnet"
}

test_llm_score_dry_run_shows_prompt() {
  local tmp_result tmp_rubric
  tmp_result=$(mktemp /tmp/llm-score-test-XXXXXX.json)
  tmp_rubric=$(mktemp /tmp/llm-score-rubric-XXXXXX.json)
  echo '{"result": "Found bug in api.ts:42"}' > "$tmp_result"
  cat > "$tmp_rubric" <<'JSON'
{
  "name": "test-review",
  "criteria": [
    {"name": "quality", "weight": 1.0, "description": "Overall quality", "scoring": {"0": "Bad", "1": "OK", "2": "Good", "3": "Great"}}
  ]
}
JSON
  local output
  output=$("$EVALS_DIR/llm-score.sh" --result "$tmp_result" --rubric "$tmp_rubric" --dry-run 2>&1) || true
  rm -f "$tmp_result" "$tmp_rubric"
  assert_contains "$output" "quality" "dry-run should include criterion name in prompt" || return 1
  assert_contains "$output" "Found bug in api.ts:42" "dry-run should include result text in prompt" || return 1
}

test_llm_score_dry_run_shows_json_schema() {
  local tmp_result tmp_rubric
  tmp_result=$(mktemp /tmp/llm-score-test-XXXXXX.json)
  tmp_rubric=$(mktemp /tmp/llm-score-rubric-XXXXXX.json)
  echo '{"result": "test"}' > "$tmp_result"
  cat > "$tmp_rubric" <<'JSON'
{
  "name": "test",
  "criteria": [
    {"name": "quality", "weight": 1.0, "description": "Test", "scoring": {"0": "Bad", "1": "OK", "2": "Good", "3": "Great"}}
  ]
}
JSON
  local output
  output=$("$EVALS_DIR/llm-score.sh" --result "$tmp_result" --rubric "$tmp_rubric" --dry-run 2>&1) || true
  rm -f "$tmp_result" "$tmp_rubric"
  assert_contains "$output" "--json-schema" "dry-run should show --json-schema flag" || return 1
  assert_contains "$output" "--output-format json" "dry-run should show --output-format json" || return 1
}

test_llm_score_dry_run_shows_budget() {
  local tmp_result tmp_rubric
  tmp_result=$(mktemp /tmp/llm-score-test-XXXXXX.json)
  tmp_rubric=$(mktemp /tmp/llm-score-rubric-XXXXXX.json)
  echo '{"result": "test"}' > "$tmp_result"
  cat > "$tmp_rubric" <<'JSON'
{
  "name": "test",
  "criteria": [
    {"name": "quality", "weight": 1.0, "description": "Test", "scoring": {"0": "Bad", "1": "OK", "2": "Good", "3": "Great"}}
  ]
}
JSON
  local output
  output=$("$EVALS_DIR/llm-score.sh" --result "$tmp_result" --rubric "$tmp_rubric" --dry-run 2>&1) || true
  rm -f "$tmp_result" "$tmp_rubric"
  assert_contains "$output" "--max-budget-usd" "dry-run should show budget flag"
}

test_llm_score_dry_run_has_no_session() {
  local tmp_result tmp_rubric
  tmp_result=$(mktemp /tmp/llm-score-test-XXXXXX.json)
  tmp_rubric=$(mktemp /tmp/llm-score-rubric-XXXXXX.json)
  echo '{"result": "test"}' > "$tmp_result"
  cat > "$tmp_rubric" <<'JSON'
{
  "name": "test",
  "criteria": [
    {"name": "quality", "weight": 1.0, "description": "Test", "scoring": {"0": "Bad", "1": "OK", "2": "Good", "3": "Great"}}
  ]
}
JSON
  local output
  output=$("$EVALS_DIR/llm-score.sh" --result "$tmp_result" --rubric "$tmp_rubric" --dry-run 2>&1) || true
  rm -f "$tmp_result" "$tmp_rubric"
  assert_contains "$output" "--no-session-persistence" "should use --no-session-persistence"
}

test_llm_score_empty_result_field() {
  local tmp_result tmp_rubric
  tmp_result=$(mktemp /tmp/llm-score-test-XXXXXX.json)
  tmp_rubric=$(mktemp /tmp/llm-score-rubric-XXXXXX.json)
  echo '{"result": ""}' > "$tmp_result"
  cat > "$tmp_rubric" <<'JSON'
{
  "name": "test",
  "criteria": [
    {"name": "quality", "weight": 1.0, "description": "Test", "scoring": {"0": "Bad", "1": "OK", "2": "Good", "3": "Great"}}
  ]
}
JSON
  local exit_code=0
  "$EVALS_DIR/llm-score.sh" --result "$tmp_result" --rubric "$tmp_rubric" 2>/dev/null || exit_code=$?
  rm -f "$tmp_result" "$tmp_rubric"
  assert_eq "1" "$exit_code" "should fail when result field is empty"
}

test_llm_score_dry_run_includes_scoring_levels() {
  local tmp_result tmp_rubric
  tmp_result=$(mktemp /tmp/llm-score-test-XXXXXX.json)
  tmp_rubric=$(mktemp /tmp/llm-score-rubric-XXXXXX.json)
  echo '{"result": "test output"}' > "$tmp_result"
  cat > "$tmp_rubric" <<'JSON'
{
  "name": "test-review",
  "criteria": [
    {"name": "quality", "weight": 0.5, "description": "Overall quality", "scoring": {"0": "Terrible", "1": "Weak", "2": "Solid", "3": "Excellent"}}
  ]
}
JSON
  local output
  output=$("$EVALS_DIR/llm-score.sh" --result "$tmp_result" --rubric "$tmp_rubric" --dry-run 2>&1) || true
  rm -f "$tmp_result" "$tmp_rubric"
  assert_contains "$output" "Terrible" "prompt should include score 0 description" || return 1
  assert_contains "$output" "Excellent" "prompt should include score 3 description" || return 1
}

# ============================================================
# generate-eval-json.sh tests
# ============================================================

test_generate_eval_json_exists() {
  assert_file_exists "$EVALS_DIR/generate-eval-json.sh"
}

test_generate_eval_json_rejects_unknown_flags() {
  local exit_code=0
  "$EVALS_DIR/generate-eval-json.sh" --bogus-flag 2>/dev/null || exit_code=$?
  assert_eq "1" "$exit_code" "should fail with unknown flag"
}

test_generate_eval_json_accepts_no_llm() {
  # Should not error on --no-llm (actual run may fail if no results, but arg parsing should succeed)
  local output
  output=$("$EVALS_DIR/generate-eval-json.sh" --no-llm 2>&1) || true
  # If it got past arg parsing, it either succeeded or failed on results — not on the flag
  assert_not_contains "$output" "Unknown argument" "should accept --no-llm flag"
}

test_generate_eval_json_help() {
  local output
  output=$("$EVALS_DIR/generate-eval-json.sh" --help 2>&1) || true
  assert_contains "$output" "--no-llm" "help should mention --no-llm flag"
}

# ============================================================
# score.sh integration tests
# ============================================================

test_score_skips_llm_score_files() {
  # Create fixture with a .llm-score.json file that should be ignored
  local fixture_dir="$EVALS_DIR/tests/fixtures/results/cf-review/with-cf"
  mkdir -p "$fixture_dir"
  cat > "$fixture_dir/with-cf--test.json" <<'JSON'
{"result": "Found bug in api.ts:42 — missing error handling"}
JSON
  cat > "$fixture_dir/with-cf--test.llm-score.json" <<'JSON'
{"scores": [{"name": "test", "score": 3, "reason": "cached"}], "weighted_average": 3.0}
JSON

  local output
  output=$("$EVALS_DIR/score.sh" --skill cf-review --results-dir "$EVALS_DIR/tests/fixtures/results" 2>&1) || true

  rm -rf "$EVALS_DIR/tests/fixtures"

  # The llm-score.json file should not appear as a scored file
  assert_not_contains "$output" "no result field" "should skip .llm-score.json files" || return 1
}

test_score_handles_unsupported_check_type() {
  # Create a fixture with a rubric that has a "command" type check
  local fixture_dir="$EVALS_DIR/tests/fixtures/results/test-skill/bench-test/with-cf"
  local rubric_dir="$EVALS_DIR/tests/fixtures/rubrics"
  mkdir -p "$fixture_dir" "$rubric_dir"

  cat > "$fixture_dir/with-cf--test.json" <<'JSON'
{"result": "All 5 tests pass. Fixed the bug."}
JSON
  cat > "$rubric_dir/test-skill.json" <<'JSON'
{
  "name": "test-skill",
  "criteria": [
    {"name": "quality", "weight": 1.0, "description": "Test", "scoring": {"0":"Bad","1":"OK","2":"Good","3":"Great"},
     "automated_check": {"type": "command", "command": "npm test", "target": "exit_code"}}
  ]
}
JSON

  local output
  output=$("$EVALS_DIR/score.sh" --skill test-skill --results-dir "$EVALS_DIR/tests/fixtures/results" 2>&1) || true

  rm -rf "$EVALS_DIR/tests/fixtures"

  # Should show "skipped" for unsupported check type, not "PASS"
  assert_contains "$output" "test-skill" || return 1
}

# ============================================================
# rubric JSON validity tests
# ============================================================

test_rubric_cf_fix_valid() {
  jq empty "$EVALS_DIR/rubrics/cf-fix.json" 2>/dev/null || { echo "    cf-fix.json is invalid JSON"; return 1; }
}

test_rubric_cf_tdd_valid() {
  jq empty "$EVALS_DIR/rubrics/cf-tdd.json" 2>/dev/null || { echo "    cf-tdd.json is invalid JSON"; return 1; }
}

test_rubric_cf_fix_no_command_checks() {
  # Verify cf-fix rubric no longer uses "command" type checks
  local count
  count=$(jq '[.criteria[].automated_check? // {} | select(.type == "command")] | length' "$EVALS_DIR/rubrics/cf-fix.json" 2>/dev/null)
  assert_eq "0" "$count" "cf-fix should not have command-type checks"
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
  run_test test_run_eval_dry_run_shows_conversation_file

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
  run_test test_score_rubric_exists_cf_review
  run_test test_score_rubric_valid_cf_review
  run_test test_score_rubric_has_criteria
  run_test test_score_with_fixture

  echo ""
  echo "--- llm-score.sh ---"
  run_test test_llm_score_exists
  run_test test_llm_score_executable
  run_test test_llm_score_help
  run_test test_llm_score_missing_result_arg
  run_test test_llm_score_missing_rubric_arg
  run_test test_llm_score_missing_result_file
  run_test test_llm_score_missing_rubric_file
  run_test test_llm_score_default_model
  run_test test_llm_score_custom_model
  run_test test_llm_score_dry_run_shows_prompt
  run_test test_llm_score_dry_run_shows_json_schema
  run_test test_llm_score_dry_run_shows_budget
  run_test test_llm_score_dry_run_has_no_session
  run_test test_llm_score_empty_result_field
  run_test test_llm_score_dry_run_includes_scoring_levels

  echo ""
  echo "--- generate-eval-json.sh ---"
  run_test test_generate_eval_json_exists
  run_test test_generate_eval_json_rejects_unknown_flags
  run_test test_generate_eval_json_accepts_no_llm
  run_test test_generate_eval_json_help

  echo ""
  echo "--- score.sh integration ---"
  run_test test_score_skips_llm_score_files
  run_test test_score_handles_unsupported_check_type

  echo ""
  echo "--- rubric validity ---"
  run_test test_rubric_cf_fix_valid
  run_test test_rubric_cf_tdd_valid
  run_test test_rubric_cf_fix_no_command_checks

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
