---
name: implement-spec
description: Implement code following a spec document phase by phase. Use after a spec is approved and ready to implement.
---

# Implement Spec

Implement a spec document phase by phase, verifying each phase before moving to the next.

## Process

### 1. Read the entire spec
Read the spec file completely. Understand the problem, solution, goals, non-goals, and all phases before writing any code.

### 2. Read all important files
Read every file listed in the spec's "Important files" section. Read external documentation links. Do not start coding until you have a complete mental model.

### 3. Implement the phase
Complete every task item in the current phase, including all success criteria. Write the code, add necessary imports, and ensure the code compiles.

### 4. Verify
Run `pnpm type-check` and `pnpm test` after each phase. Verify that the success criteria are actually met — don't just check that tests pass, confirm the behavior is correct.

### 5. Mark tasks complete
After verifying, mark the phase's tasks as `[x]` in the spec file.

### 6. Do not commit automatically
Present the completed phase to the user for review. Do not commit until the user approves.

### 7. Handle feedback
Iterate on the implementation based on user feedback. Update the spec if the implementation diverges from the original plan.

### 8. Update the spec before committing
If the implementation deviated from the spec, update the spec to reflect what was actually built. The spec should always match reality.

### 9. Propose future work
If you discover non-blocking improvements during implementation, note them as "Future work" in the spec rather than expanding scope.

### 10. Move to next phase
Only proceed to the next phase after the current one is approved and committed.

## Rules

1. Complete one phase at a time. Never implement multiple phases simultaneously.
2. Every phase must produce user-visible progress. No invisible refactoring phases.
3. If you find the spec is wrong or incomplete, pause and discuss with the user before deviating.
4. Type-check and tests must pass after every phase.
5. Keep changes minimal — only the code needed to satisfy the phase's success criteria.
