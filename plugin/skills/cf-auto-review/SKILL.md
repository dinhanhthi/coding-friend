---
name: cf-auto-review
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

Scale depth to review mode (QUICK skips Phase 1, DEEP adds exploit scenarios):

#### Phase 1: Context Research (skip in QUICK mode)

- Identify existing security frameworks/libraries in the project
- Look for established sanitization/validation patterns
- Understand trust boundaries (user input → internal → external services)

#### Phase 2: Vulnerability Assessment

Check changed code against these categories:

| Category             | Look for                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| **Input Validation** | SQL injection, command injection, XXE, template injection, path traversal |
| **Auth & Access**    | Auth bypass, privilege escalation, session flaws, JWT issues              |
| **Secrets & Crypto** | Hardcoded keys/tokens, weak crypto, improper key storage                  |
| **Code Execution**   | RCE via deserialization, eval injection, XSS (reflected/stored/DOM)       |
| **Data Exposure**    | Sensitive data in logs, PII handling, API endpoint leakage, debug info    |
| **Prompt Injection** | External content (web, API, user input) targeting AI without sanitization |

**Method**: Trace data flow from user inputs → through processing → to sensitive operations. Flag where untrusted data crosses trust boundaries without validation.

#### Phase 3: Confidence Filtering

For each finding, assign confidence (0.0–1.0):

- **0.9–1.0**: Certain exploit path identified
- **0.8–0.9**: Clear vulnerability pattern with known exploitation methods
- **< 0.8**: Do NOT report — too speculative

**False positives** (do NOT flag):

- UUIDs as identifiers (assumed unguessable)
- Environment variables / CLI flags (trusted values)
- Framework default protections (React auto-escaping, Angular sanitization) unless explicitly bypassed
- Client-side permission checks (not real security boundaries)
- Logging non-PII data
- DoS / rate limiting (out of scope for code review)

### Layer 4: Testing

- **Coverage**: Are new code paths tested?
- **Quality**: Do tests verify behavior, not implementation?
- **Edge cases**: Are error paths and boundary conditions tested?
- **Regression**: Would these tests catch the bug if reintroduced?

## Issue Severity

| Level          | Meaning                                   | Action                |
| -------------- | ----------------------------------------- | --------------------- |
| **Critical**   | Bug, security hole, data loss risk        | Must fix before merge |
| **Important**  | Design issue, missing test, poor naming   | Should fix            |
| **Suggestion** | Style, alternative approach, nice-to-have | Consider              |

## Review Response Protocol

When receiving review feedback:

1. **Read** the entire review before responding
2. **Understand** each point — ask clarifying questions if unclear
3. **Verify** claims by reading the actual code yourself
4. **Evaluate** whether each point is valid
5. **Respond** with technical reasoning, not performative agreement
6. **Push back** when the reviewer is wrong — with evidence

Do NOT respond with "You're absolutely right!" or "Great point!" — respond with substance.
