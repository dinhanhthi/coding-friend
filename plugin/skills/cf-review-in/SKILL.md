---
name: cf-review-in
description: >
  Collect and act on review results from an external AI agent. Reads the result file
  written by an external reviewer and presents findings, then offers to fix issues.
  Use when the user wants to collect an outside review — e.g. "review in", "collect review",
  "check review results", "cf-review-in", "read external review", "import review".
user-invocable: true
argument-hint: "<label>"
---

# /cf-review-in

Collect external review results for: **$ARGUMENTS**

## Purpose

Reads the review results written by an external AI agent (generated via [`/cf-review-out`](/docs/skills/cf-review-out/)) and presents them in the conversation. Then offers to fix any issues found.

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review-in`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

1. **Determine the label:**

   If `$ARGUMENTS` contains a label, use it. Otherwise:
   - List available result files in `<docsDir>/reviews/` that match `*-result-*.md`
   - Extract unique labels from the filenames (pattern: `<label>-result-<service>.md`)
   - If exactly one label exists, use it
   - If multiple labels exist, ask the user which one to collect
   - If none exist, tell the user no results are available and suggest running `/cf-review-out` first

2. **Find and read all result files for the label:**

   Check the docsDir from `.coding-friend/config.json` (default: `docs`).

   Glob for all files matching `<docsDir>/reviews/<label>-result-*.md`. Each file corresponds to a different external reviewer/service (e.g., `<label>-result-gemini.md`, `<label>-result-chatgpt.md`).
   - If **no files found** → tell the user: _"No results found for label `<label>`. Make sure external agents have written their reviews to `<docsDir>/reviews/<label>-result-<service>.md`."_ → **STOP**.
   - If **one or more files found** → read all of them. Extract the service name from each filename (the part after `result-` and before `.md`).
   - If any file is empty or malformed → warn the user about that specific file but continue processing the rest.

3. **Validate and parse each result file:**

   For each result file found, check for:
   - Frontmatter with matching `label`
   - Sections: Critical Issues, Important Issues, Suggestions, Summary
   - If format doesn't match exactly, normalize it — extract issues and categorize by severity
   - Track which service/reviewer each finding came from

4. **Read context** (for verification):

   Read `<docsDir>/reviews/<label>-prompt.md` to understand what was reviewed. Use the diff from the prompt to understand the code context.

5. **Critical verification — do NOT blindly trust external findings:**

   External reviewers (AI or human) can produce false positives, miss context, or misunderstand intent. For **every** Critical and Important issue reported:

   a. **Read the actual source code** at the referenced file and line number. If the file or line doesn't exist (code may have changed since the review), mark the finding as `Stale`.

   b. **Verify the claim against reality:**
   - Does the issue actually exist in the current code?
   - Did the reviewer miss surrounding context that addresses the concern? (e.g., validation done elsewhere, error handled upstream, intentional design choice)
   - Is the reviewer applying a generic best practice that doesn't apply to this specific codebase or situation?
   - Is the reviewer suggesting something that would contradict project conventions (check CLAUDE.md, `docs/memory/conventions/`)?

   c. **Classify each finding:**
   - `Confirmed` — verified the issue exists and is valid
   - `Questionable` — the concern has some merit but may not apply here; needs user judgment
   - `Dismissed` — false positive, stale reference, or contradicts project context
   - `Stale` — referenced code has changed since the review

   d. For **Suggestions**, do a lighter check: skim the referenced code and flag only obviously wrong suggestions. Do not deep-verify every suggestion.

   e. **Never auto-fix dismissed findings.** Only offer to fix Confirmed and Questionable (with user approval) findings.

6. **Present the verified results:**

   Display the review with verification verdicts. If **multiple reviewers** submitted results, present each reviewer's findings under a separate heading. If only one reviewer, use the simpler single-reviewer format.

   **Multiple reviewers format:**

   ```
   ## 🔍 External Review: <label>

   > Verified by Coding Friend against current codebase.
   > Reviewers: **<service-1>**, **<service-2>**, ...

   ---

   ### 📝 <service-1>

   #### 🚨 Critical Issues
   - **[L<n>]** ✅ Confirmed — <issue> at <file>:<line>
     _Verification: <brief explanation of why this is valid>_
   - **[L<n>]** ❌ Dismissed — <issue> at <file>:<line>
     _Reason: <why this is a false positive or doesn't apply>_

   #### ⚠️ Important Issues
   - **[L<n>]** ✅ Confirmed — <issue> at <file>:<line>
   - **[L<n>]** ❓ Questionable — <issue> at <file>:<line>
     _Note: <why this needs user judgment>_

   #### 💡 Suggestions
   - **[L<n>]** <suggestion>

   #### 📋 Reviewer's Summary
   <assessment from this reviewer>

   ---

   ### 📝 <service-2>
   (same structure)

   ---

   ### 📊 Combined Verification Summary
   - Confirmed: N | Questionable: N | Dismissed: N | Stale: N
   - Cross-reviewer agreement: note any issues flagged by multiple reviewers (higher confidence)
   ```

   **Single reviewer format** (same as before):

   ```
   ## 🔍 External Review: <label>

   > Review by **<reviewer>** (from result frontmatter, or "external agent" if not specified)
   > Verified by Coding Friend against current codebase.

   ### 🚨 Critical Issues
   - **[L<n>]** ✅ Confirmed — <issue> at <file>:<line>
     _Verification: <brief explanation of why this is valid>_
   - **[L<n>]** ❌ Dismissed — <issue> at <file>:<line>
     _Reason: <why this is a false positive or doesn't apply>_

   ### ⚠️ Important Issues
   - **[L<n>]** ✅ Confirmed — <issue> at <file>:<line>
   - **[L<n>]** ❓ Questionable — <issue> at <file>:<line>
     _Note: <why this needs user judgment>_

   ### 💡 Suggestions
   - **[L<n>]** <suggestion>
     _(flagged only if obviously wrong)_

   ### 📊 Verification Summary
   - Confirmed: N | Questionable: N | Dismissed: N | Stale: N

   ### 📋 Reviewer's Summary
   <assessment from external agent>
   ```

   Add a note: _"This review was performed by external agent(s). All Critical and Important findings have been independently verified against the current codebase. Dismissed findings are shown for transparency but will not be acted on."_

7. **Smart capture** (conditional — only if `memory_store` MCP tool is available):

   If any reviewer found **architectural insights** or **recurring patterns** worth preserving (from Confirmed findings only), call `memory_store` with type: "fact", importance: 3, source: "auto-capture". Issues flagged by multiple reviewers are especially worth capturing.

   Skip if the review was routine with no notable findings.

8. **Completion banner and next steps:**

   Count only `Confirmed` and `Questionable` findings across all reviewers (ignore Dismissed and Stale).

   **If NO confirmed/questionable issues were found:**

   ```
   ╔══════════════════════════════════════════════════╗
   ║  ✅  External Review Collected & Verified         ║
   ╚══════════════════════════════════════════════════╝
   ```

   > Label: **<label>** · Reviewer(s): **<service-1>**, **<service-2>**, ...
   > No actionable issues after verification.
   > (N finding(s) from external reviewer(s) were dismissed as false positives.)
   >
   > You're clear to commit. Run `/cf-commit` when ready.

   **If confirmed or questionable issues were found:**

   ```
   ╔══════════════════════════════════════════════════╗
   ║  ⚠️  External Review — Action Needed             ║
   ╚══════════════════════════════════════════════════╝
   ```

   > Label: **<label>** · Reviewer(s): **<service-1>**, **<service-2>**, ...
   > **[N] verified issue(s)** need attention (M dismissed as false positives).
   >
   > Shall I fix the confirmed issues now? (Questionable items will be presented for your decision.)

   If the user agrees, fix each **Confirmed** issue following TDD discipline (load `cf-tdd` skill first). For **Questionable** items, present each one and ask the user before acting.

9. **Update prompt status:**

   After collecting, update the frontmatter in `<docsDir>/reviews/<label>-prompt.md`: change `status: pending` to `status: collected`.
