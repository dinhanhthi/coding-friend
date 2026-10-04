# Discovery rounds (cf-plan Step 1)

Ask the user each round; never batch. Keep Q&A verbatim for `brief.md`.

**Round 1 — Understand:** List ambiguities and assumptions; ask about objectives, constraints, success criteria, preferred libraries/APIs — never guess.

**Official solutions first:** (1) framework built-ins, (2) official patterns/guides, (3) ecosystem standards. Official solution = **Option 1**; recommend custom only if official is insufficient for this case.

**Round 2 — Challenge:** Question the path (user/dev/ops/business). YAGNI, KISS, DRY. Attack the recommended approach — dependency failure, 10x scale, rollback cost, fragile premise. If an attack holds, deform the design; if it shatters it, discard and say why.

**Round 3 — Converge** (if needed): 2–3 approaches with pros/cons; ask which. Skip if already clear.

> **Hard mode** — **Round 4: Risk & Rollback**: failure modes, blast radius, rollback, feature flags / gradual rollout, incremental vs all-or-nothing.

If the user says "just plan it", skip brainstorming.
