## Before

### New Skill/Agent Detection

**Force trigger:** If the task description contains `--skill` or `--agent` flag → strip the flag from the description, pre-select the type (skill or agent) for the Skill Type Decision later, and **skip detection + confirmation** — go directly to the challenge below.

**Auto-detect:** Scan the task description for these keyword patterns (case-insensitive):

- "new skill", "create skill", "add skill", "build skill"
- "new command", "create command", "add command"
- "new agent", "create agent", "add agent"

If **none** of these patterns match → skip this entire Before section and proceed with standard cf-plan.

If a pattern matches → ask the user to confirm: **"It looks like you want to create a new Coding Friend skill/agent — is that correct?"** If they say no, skip this Before section.

If confirmed → proceed with the challenge below.

### Challenge: Is a New Skill Really Needed?

Before planning anything, challenge the idea rigorously. Ask the user these questions using `AskUserQuestion` (one round, all 5 questions — batched intentionally to minimize back-and-forth since these are validation questions, not discovery):

1. **What specific gap does this fill?** What can't you do today with existing skills? Be concrete — "it would be nice" is not a gap.

2. **Can an existing skill be extended instead?** Read `plugin/context/bootstrap.md` at runtime to get the current inventory of skills and agents (do not rely on a hardcoded list — skills change over time). Could any of them be extended with new steps, modes, or flags to cover this use case?

3. **Can existing skills be combined/chained?** Could a workflow combining 2-3 existing skills achieve the same result? For example, `/cf-scan` + `/cf-remember` or `/cf-fix` + `/cf-review`. If yes, a small doc describing the combo may be all that's needed.

4. **Who is the audience?** All Coding Friend users (→ plugin skill), only this project (→ custom guide), or only you the creator (→ `.claude/skills/`)?

5. **How would this integrate?** Which existing skills would auto-invoke this? Which skills would this invoke? Coding Friend prefers skills to work together — a standalone skill with no connections is a red flag.

### Evaluate the Answers

Based on the user's answers, determine one of three outcomes:

**Outcome A — No new skill needed (extend existing):**
If an existing skill can be extended → write a decision doc to `docs/plans/YYYY-MM-DD-extend-<existing-skill>-<slug>.md` explaining:

- Which existing skill to extend
- What changes are needed
- Why a new skill is unnecessary

Then suggest running `/cf-remember` to capture this decision. **STOP here** — do not proceed with the rest of cf-plan.

**Outcome B — No new skill needed (combo):**
If a skill combo works → write a decision doc to `docs/plans/YYYY-MM-DD-combo-<slug>.md` explaining:

- Which skills to combine and in what order
- Example workflow
- Why a new skill is unnecessary

Then suggest running `/cf-remember` to capture this decision. **STOP here.**

**Outcome C — New skill/agent is justified:**
Proceed with the rest of cf-plan. But first:

- If the user did not provide a name → suggest a short, meaningful `cf-*` name with rationale. Ask for confirmation.
- Determine: is this a slash command, auto-invoked, or both?
- Determine: does it need a new agent, or can it reuse existing ones?
- Using Anthropic's builtin `/skill-creator` to create the skill.
- Announce: "Proceeding to plan new skill: `/cf-<name>`" and continue to Step 1 (Discovery).

## Rules

These rules apply **only** when the Before section detected a new skill/agent planning task.

### Checklist Compliance

- The plan **MUST** reference and incorporate ALL items from `docs/memory/conventions/new-skill-agent-checklist.md`. Read this file at runtime — do not rely on cached knowledge.
- Every task in the plan must map to at least one checklist item. If a checklist item has no corresponding task, add one.
- For skills: 12 locations must be covered. For agents: 6 locations.

### Integration Requirements

- The plan **MUST** include an `## Integration` section specifying:
  - **Works with**: which existing skills complement this one?
  - **Auto-invokes**: should any existing skill auto-invoke this? Under what conditions?
  - **Invoked by this**: which skills/agents does this skill dispatch or reference?
  - **Replaces/overlaps**: does this partially overlap with an existing skill? If yes, how is the boundary drawn?

### Naming

- All skill names follow the `cf-*` pattern (e.g., `cf-deploy`, `cf-migrate`)
- All agent names follow the `cf-*` pattern (e.g., `cf-deployer`)
- Names should be short (1-2 words after `cf-`), descriptive, and verb-oriented for skills

### Stats Update

- When the plan includes adding a new skill or agent, it **MUST** include a task to update `website/src/components/landing/StatsSection.tsx` with the correct counts.
- To get the counts, read `plugin/context/bootstrap.md` at runtime:
  - **Skills count**: count ALL unique skill names from both the "Slash Commands" list and the "Auto-Invoked" list (deduplicate names that appear in both, e.g. `cf-help`). Format as `"N+"`.
  - **Agents count**: count the items in the "Available Agents" list. Format as `"N"`.
- Update the `stats` array values in `StatsSection.tsx` to match the new counts.
- This task should come AFTER the checklist tasks that create the new skill/agent files.

### TokenTables Metadata Update

- When the plan includes adding a new skill or agent, it **MUST** include a task to update `website/src/components/docs/TokenTables.tsx` with metadata for the new entry.
- For a new **slash command**: add an entry to `slashCommandMeta` (short description) AND `overviewSlashMeta` (description + triggeredBy: "slash" | "slash + auto"). Keep entries sorted alphabetically by key.
- For a new **auto-invoked skill**: add an entry to `autoSkillMeta` (activates-when text) AND `overviewAutoMeta` (activatesWhen + whatItDoes). Keep entries sorted alphabetically by key.
- For a new **agent**: add an entry to `agentMeta` (short purpose) AND `agentRefMeta` (longer purpose description). Keep entries sorted alphabetically by key.
- This task should come AFTER the checklist tasks that create the new skill/agent files.

### Landing Skills Metadata Update

- When the plan includes adding a new skill, it **MUST** include a task to update `website/src/components/landing/Skills.tsx` with metadata for the new entry.
- For a new **slash command**: add an entry to `slashCommandMeta` array with `command`, `title`, and `description`. Keep the array sorted alphabetically by `command`.
- For a new **auto-invoked skill**: add an entry to `autoSkillMeta` array with `command` (no `/` prefix), `title`, and `description`. Keep the array sorted alphabetically by `command`.
- This task should come AFTER the checklist tasks that create the new skill/agent files.

### README Commands Table Update

- When the plan includes adding a new **slash command**, it **MUST** include a task to update the `## Commands` table in `README.md` with a new row: `| /cf-<name> [args] | Short description |`.
- Keep the table in the same order as existing entries (grouped logically, not strictly alphabetical).
- If the new skill is **auto-invoked only** (no slash), add it to the "Auto-invoked skills" line instead.
- This task should come AFTER the checklist tasks that create the new skill files.

### LLMs.txt Regeneration

- When the plan includes adding a new skill or agent with a website doc page, it **MUST** include a task to regenerate `llms.txt` and `llms-full.txt`: `cd website && npx tsx scripts/generate-llms-txt.ts`
- These files are auto-generated from `docsNavigation` in `website/src/lib/navigation.ts` — never edit them manually
- This task should come AFTER creating the website doc page and updating `navigation.ts`

### Composition Over Creation

- Always prefer extending an existing skill or creating a custom guide over adding a new plugin skill
- If a new agent is proposed, require explicit justification for why existing agents (`cf-explorer`, `cf-implementer`, `cf-planner`, `cf-reviewer`, `cf-writer`, `cf-writer-deep`) cannot handle the task
- If the skill is internal-only (creator use), prefer `.claude/skills/` or custom guide over `plugin/skills/`

### Skill Type Decision

- The plan must explicitly specify: **slash command** (user-invocable), **auto-invoked** (triggered by context), or **both**
- If auto-invoked: specify the trigger conditions and which hook/skill detects them
- If both: explain why manual invocation AND auto-invocation are both needed

## After

This section runs when the Before section detected a new skill/agent planning task (any outcome: A, B, or C).

### Checklist Coverage Verification (Outcome C only)

1. Read `docs/memory/conventions/new-skill-agent-checklist.md`
2. Compare every checklist item against the plan's tasks
3. List any **missing items** — add tasks for them before saving the plan
4. Print: `Checklist coverage: X/12 items covered (skill)` or `Checklist coverage: X/6 items covered (agent)`

### Stats Update Verification (Outcome C only)

- Verify the plan includes a task to update `StatsSection.tsx` with recounted skill/agent numbers
- If missing → add the task before saving

### Integration Verification (Outcome C only)

- Verify the plan has an `## Integration` section with all 4 subsections (Works with, Auto-invokes, Invoked by this, Replaces/overlaps)
- If missing → add it before saving

### Decision Doc Verification (Outcomes A/B only)

- Verify a decision doc was written to `docs/plans/`
- Suggest: "Run `/cf-remember` to capture this decision so we don't revisit the same idea later"

### Summary

**For Outcome C** (new skill/agent justified):

```
🆕 Name: /cf-<name>
⚙️ Type: slash command | auto-invoked | both
✅ Checklist: X/Y items covered
🔗 Integration: <list of connected skills>
👉 Next: /cf-review → /cf-commit
```

**For Outcomes A/B** (no new skill needed):

```
📋 Decision: extend /cf-<existing> | combo <skill1> + <skill2>
📄 Doc: docs/plans/<filename>.md
💾 Next: /cf-remember to capture this decision
```
