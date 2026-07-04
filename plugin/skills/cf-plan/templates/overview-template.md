<!-- cf-plan human overview template (markdown). cf-writer-deep fills the FILL markers from the agent plan. Keep it concise and decision-focused; no step-by-step task lists. -->

# {Plan name}

<!-- FILL: plan name, e.g. "Add streaming support to cf-review" -->

## Plan at a Glance

<!-- FILL: counts from the plan. Add a Files row only if the plan states it. -->

- **Phases:** {N}
- **Tasks:** {N}

## Problem & Intent

<!-- FILL: the original problem / intention / purpose as concise bullets -->

- Bullet one: what is broken, missing, or desired.
- Bullet two: why it matters / the impact.

## Solution (Big Picture)

<!-- FILL: the chosen approach as concise bullets, high level, no step-by-step TODOs -->

- Bullet one: the core of the approach.
- Bullet two: how it solves the problem.

## Key Decisions

<!-- FILL: the main decisions the plan makes, one concise line each -->

- Decision one: short phrase that captures the choice made.
- Decision two: another choice and brief rationale if non-obvious.
- Decision three: a third example decision.

## Diagrams

<!-- FILL: ASCII diagram(s) (plain text, box-drawing/arrow characters) for structure / flow / state machine / algorithm where a picture beats prose -->

```
/cf-plan triggered
      |
      v
 cf-planner agent
      |
      v
 exploration done? ----no----> explore codebase --+
      |                                            |
     yes                                           |
      |<-------------------------------------------+
      v
 write plan phases
      |
      v
 cf-writer-deep fills overview
```

## Not Building

<!-- FILL: explicit out-of-scope items -->

- Out-of-scope item one.
- Out-of-scope item two.
- Out-of-scope item three.
