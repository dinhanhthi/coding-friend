# Evaluating cf-session

## What We Test

Whether the cf-session skill can save and load Claude Code sessions for later resumption. We measure save correctness, load correctness, and file format validity.

## Prompt(s)

**bench-webapp** (`prompts/cf-session/bench-webapp.md`):

> Save the current session so we can resume later.

## Benchmark Repos Used

- **bench-webapp** -- Used as the working directory for the session save operation.

## Rubric Criteria

| Criterion                | Weight | Description                                         |
| ------------------------ | ------ | --------------------------------------------------- |
| session_saved_correctly  | 0.40   | Session state is captured completely and accurately |
| session_loaded_correctly | 0.40   | Loading restores enough context to continue work    |
| format_valid             | 0.20   | Session file uses valid format and is parseable     |

### Scoring Levels

**session_saved_correctly** (automated check: session file exists):

- 0: Save fails or produces an empty/corrupt file
- 1: Session saved but missing critical context
- 2: Session saved with main context but some details lost
- 3: Session saved with complete context: current task, modified files, decisions made, and next steps

**session_loaded_correctly**:

- 0: Load fails or restored context is unusable
- 1: Session loads but requires significant re-explanation
- 2: Session loads with main context intact but some details need clarification
- 3: Session loads seamlessly -- can continue work exactly where it left off

**format_valid** (automated check: YAML validation):

- 0: File is not valid YAML/JSON -- parse errors
- 1: File parses but has structural issues
- 2: File parses correctly with required fields but some optional fields missing
- 3: File is valid, well-structured, and includes all expected fields

Notes: The test should ideally save a session, start a new conversation, load it, and verify the agent can continue.

## What We Expect

### With CF

- Session saved to a structured file
- Complete context captured (task, files, decisions)
- Loadable in a new session

### Without CF

- Similar session save capability
- May use different format or approach

## What We Compare

- Whether sessions can be saved at all
- Completeness of saved context
- Whether saved sessions can be loaded in new conversations

## Actual Results (March 2026)

### Scores

| Condition          | session_saved_correctly | session_loaded_correctly | format_valid | Weighted Total |
| ------------------ | ----------------------- | ------------------------ | ------------ | -------------- |
| With CF (1 run)    | 0                       | 0                        | 0            | **0.00**       |
| Without CF (1 run) | 0                       | 0                        | 0            | **0.00**       |

**Delta: 0.00**

### Cost

| Condition  | Cost   | Time |
| ---------- | ------ | ---- |
| With CF    | $0.285 | 64s  |
| Without CF | $0.341 | 98s  |

### Key Observations

1. **Both conditions failed completely.** This is an eval setup issue, not a skill quality issue.
2. The eval uses `--no-session-persistence`, which prevents JSONL session file creation. Without session files, the cf-session skill cannot function.
3. Both conditions correctly diagnosed why they could not save:
   - With-CF: Could not find JSONL files. Explained the format change. Suggested `claude --resume` as an alternative.
   - Without-CF: Could not find JSONL files. Explained `--no-session-persistence` flag prevents session saves.
4. Both conditions showed good diagnostic behavior despite the environmental constraint.

## Reliability Assessment

- **Sample size**: 1 run per condition (2 total)
- **Confidence**: Zero (for evaluating skill quality). The eval setup made the skill untestable.
- **Known issues**: `--no-session-persistence` is used across all evals for isolation, but it directly prevents cf-session from working. This is a fundamental conflict between eval isolation and session testing.
- **Recommendation**: These results tell us nothing about cf-session quality. To properly evaluate this skill:
  1. Remove `--no-session-persistence` for cf-session runs only, OR
  2. Design the eval to manually create a session file, then test the load path, OR
  3. Test in a separate eval pipeline that does not need session isolation
