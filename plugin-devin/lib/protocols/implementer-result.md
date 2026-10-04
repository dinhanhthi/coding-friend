# Implementer Result and Retry

Parse the **last non-empty line** of the implementer response — `^\[CF-RESULT: (success|failure)( .*)?\]$`:

- `[CF-RESULT: success]` → continue the calling skill's success path
- `[CF-RESULT: failure] <reason>` → retry
- Missing, malformed, or not last non-empty line → failure, reason `empty-output`. Never assume silent success.

**Retry protocol** (max 1 retry):

1. Notify:

   ```
   > ⟳ Attempt 1 failed (<reason>). Retrying with error context...
   ```

2. Update `{docsDir}/context/{task-id}.json` — add `previous_failure`:

   ```json
   {
     "previous_failure": {
       "reason": "<tests-failed|compile-error|empty-output>",
       "error_summary": "<brief details from the agent>",
       "attempt": 1
     }
   }
   ```

   Keep existing keys (`task_id`, `task_summary`, `relevant_files`, `key_findings`, `constraints`, `suggested_approach`).

3. Dispatch `cf-implementer` again:

   > **RETRY** — Previous attempt failed: [reason]. Error details: [summary].
   > Review the context file at [path] for full failure context.
   > [original prompt]

4. Retry fails → escalate:

   ```
   > ✗ Both attempts failed. Summary:
   > - Attempt 1: <reason>
   > - Attempt 2: <reason>
   > Please review and guide the next step.
   ```

   Then follow the **caller skill**:
   - **cf-fix:** inline-fix with TDD discipline, or Load `cf-sys-debug` if the user prefers.
   - **cf-tdd:** wait for the user / Review Reminder path — do not auto inline-fix.

5. **Cleanup:** delete the context file after success, escalation, or cancel.

cf-plan `execute.md` keeps its own copy and must NOT use this file (it keeps the context for `/cf-plan-resume`).
