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

0. **Load Custom Guide:**

   Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review-in`

   If output is not empty, integrate the returned sections into this workflow:
   - `## Before` → execute before step 1
   - `## Rules` → apply as additional rules throughout all steps
   - `## After` → execute after the final step

1. **Determine the label:**

   If `$ARGUMENTS` contains a label, use it. Otherwise:
   - List available result files in `docs/reviews/results/` that match `*-result.md`
   - If exactly one exists, use it
   - If multiple exist, ask the user which one to collect
   - If none exist, tell the user no results are available and suggest running `/cf-review-out` first

2. **Read the result file:**

   Read `<docsDir>/reviews/results/<label>-result.md`. Check the docsDir from `.coding-friend/config.json` (default: `docs`).

   If the file doesn't exist → tell the user: _"No results found for label `<label>`. Make sure the external agent has written its review to `<docsDir>/reviews/results/<label>-result.md`."_ → **STOP**.

   If the file exists but is empty or malformed → tell the user the result file appears incomplete.

3. **Validate and parse:**

   Read the result file. Check for:
   - Frontmatter with matching `label`
   - Sections: Critical Issues, Important Issues, Suggestions, Summary
   - If format doesn't match exactly, normalize it — extract issues and categorize by severity

4. **Present the results:**

   Display the review in the standard format:

   ```
   ## 🔍 External Review: <label>

   > Review by **<reviewer>** (from result frontmatter, or "external agent" if not specified)

   ### 🚨 Critical Issues
   - **[L<n>]** <issue> at <file>:<line>

   ### ⚠️ Important Issues
   - **[L<n>]** <issue> at <file>:<line>

   ### 💡 Suggestions
   - **[L<n>]** <suggestion>

   ### 📋 Summary
   <assessment from external agent>
   ```

   Add a note: _"This review was performed by an external agent. Findings have been imported from `<docsDir>/reviews/results/<label>-result.md`."_

5. **Also read the original prompt** (for context):

   Read `<docsDir>/reviews/<label>-prompt.md` to understand what was reviewed. Use the diff from the prompt to understand the code context when fixing issues.

6. **Smart capture** (conditional — only if `memory_store` MCP tool is available):

   If the review found **architectural insights** or **recurring patterns** worth preserving, call `memory_store` with type: "fact", importance: 3, source: "auto-capture".

   Skip if the review was routine with no notable findings.

7. **Completion banner and next steps:**

   **If NO critical issues were found:**

   ```
   ╔══════════════════════════════════════════════════╗
   ║  ✅  External Review Collected                    ║
   ╚══════════════════════════════════════════════════╝
   ```

   > Label: **<label>** · No blocking issues found.
   >
   > You're clear to commit. Run `/cf-commit` when ready.

   **If critical or important issues were found:**

   ```
   ╔══════════════════════════════════════════════════╗
   ║  ⚠️  External Review — Action Needed             ║
   ╚══════════════════════════════════════════════════╝
   ```

   > Label: **<label>** · **[N] issue(s)** found by external reviewer.
   >
   > Shall I fix these issues now?

   If the user agrees, fix each issue following TDD discipline (load `cf-tdd` skill first).

8. **Update prompt status:**

   After collecting, update the frontmatter in `<docsDir>/reviews/<label>-prompt.md`: change `status: pending` to `status: collected`.
