---
name: cf-code-review
description: Code review methodology and checklist
user-invocable: false
---

# Code Review Guide

## 4-Layer Review

### Layer 1: Plan Alignment
- Does the code implement what was planned?
- Are there unexpected changes outside the plan scope?
- Are any planned items missing?

### Layer 2: Code Quality
- **Naming**: Are variables, functions, and files named clearly?
- **Complexity**: Can any function be simplified? Is there unnecessary abstraction?
- **Duplication**: Is there repeated code that should be extracted?
- **Error handling**: Are errors handled at the right level? No swallowed errors?
- **Edge cases**: Are boundary conditions handled?

### Layer 3: Security
- **Input validation**: Is user input validated at system boundaries?
- **Injection**: Any SQL injection, XSS, command injection risks?
- **Secrets**: Are API keys, passwords, tokens properly handled? Not in code?
- **Auth**: Are authentication/authorization checks in place?
- **Dependencies**: Any known vulnerable dependencies?

### Layer 4: Testing
- **Coverage**: Are new code paths tested?
- **Quality**: Do tests verify behavior, not implementation?
- **Edge cases**: Are error paths and boundary conditions tested?
- **Regression**: Would these tests catch the bug if reintroduced?

## Issue Severity

| Level | Meaning | Action |
|---|---|---|
| **Critical** | Bug, security hole, data loss risk | Must fix before merge |
| **Important** | Design issue, missing test, poor naming | Should fix |
| **Suggestion** | Style, alternative approach, nice-to-have | Consider |

## Review Response Protocol

When receiving review feedback:

1. **Read** the entire review before responding
2. **Understand** each point — ask clarifying questions if unclear
3. **Verify** claims by reading the actual code yourself
4. **Evaluate** whether each point is valid
5. **Respond** with technical reasoning, not performative agreement
6. **Push back** when the reviewer is wrong — with evidence

Do NOT respond with "You're absolutely right!" or "Great point!" — respond with substance.
