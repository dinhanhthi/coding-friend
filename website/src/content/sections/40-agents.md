## Agents

Skills dispatch agents as subagents that run in their own context.

| Agent | Model | Does | Dispatched by |
| --- | --- | --- | --- |
| cf-explorer | haiku | Maps the repo and writes context files | /cf-plan, /cf-fix, /cf-ask |
| cf-planner | inherit | Compares approaches and breaks work into tasks | /cf-plan |
| cf-implementer | inherit | Writes the code (TDD with --add-tests) | /cf-plan, /cf-fix, cf-tdd |
| cf-reviewer | inherit | Orchestrates the five-specialist review | /cf-review, /cf-ship |
| cf-reviewer-plan | sonnet | Checks the diff against the plan | cf-reviewer |
| cf-reviewer-security | sonnet | Finds security issues in the diff | cf-reviewer |
| cf-reviewer-quality | haiku | Names, complexity, duplication, slop | cf-reviewer |
| cf-reviewer-tests | haiku | Coverage and missing tests | cf-reviewer |
| cf-reviewer-rules | haiku | CLAUDE.md MUST/SHOULD/ALWAYS/NEVER | cf-reviewer |
| cf-reviewer-reducer | haiku | Deduplicates and ranks findings | cf-reviewer |
| cf-writer | haiku | Writes straightforward markdown | /cf-learn, /cf-remember, /cf-scan, /cf-fix, /cf-ask |
| cf-writer-deep | sonnet | Writes deep technical docs | /cf-learn |

Review fan-out:

```text
┌─────────────┐
│ cf-reviewer │
└──────┬──────┘
       │
       ├─→ cf-reviewer-plan
       ├─→ cf-reviewer-security
       ├─→ cf-reviewer-quality    (parallel)
       ├─→ cf-reviewer-tests
       └─→ cf-reviewer-rules
                 ↓
        cf-reviewer-reducer
                 ↓
              report
```

Plan execution:

```text
┌─────────┐    ┌────────────┐    ┌───────────┐    ┌───────────────┐
│ cf-plan │───→│ cf-explorer│───→│ cf-planner│───→│ implementer(s)│
└─────────┘    └────────────┘    └───────────┘    └───────────────┘
```

Implementer result (real format):

```text
What was implemented — added the agy install path in install.ts.
Tests run — direct mode — no new tests written.
Decisions — reuse the omp host branch; no new flag.
[CF-RESULT: success]
```
