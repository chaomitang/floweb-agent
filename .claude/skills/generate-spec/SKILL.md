---
name: generate-spec
description: Create a spec document for a feature or fix request. Use when the user asks to plan a feature, design a solution, or write a spec before implementing.
---

# Generate Spec

Create a formal spec document in the `specs/` directory. A spec defines WHAT to build before writing code.

## Process

### 1. Understand existing code
Read all relevant source files. Use code search to find related patterns and call sites. Understand the current architecture before designing changes.

### 2. Research external documentation
If the feature involves third-party APIs or libraries, consult their official documentation. Follow established best practices.

### 3. Ask critical questions
When the approach is ambiguous, present concrete design options to the user with trade-off analysis. Do not guess — clarify before writing the spec.

### 4. Establish Goals and Non-goals
- **Goals**: User-visible outcomes. Each goal is a verifiable statement of what the user can do after implementation.
- **Non-goals**: Explicitly excluded scope. Always include "no migrations or backfills" unless specifically required.

### 5. Design phases
Each phase must be:
- **Commit-sized**: < 100 lines changed
- **Verifiable**: Has success criteria as task items
- **User-visible**: Produces a change the user can see or test
- No pure refactoring phases, no "setup scaffolding" phases, no premature abstractions

## Spec Document Format

```markdown
## Problem overview
[One paragraph describing the problem or need]

## Solution overview
[One paragraph describing the approach at a high level]

## Goals
- [ ] Goal 1: User can ...
- [ ] Goal 2: System provides ...

## Non-goals
- Not doing X
- No migrations or backfills

## Important files/docs/websites for implementation
- `src/path/to/file.ts` — description of relevance
- https://docs.example.com — relevant API docs

## Implementation

### Phase 1: [Title]
[One sentence describing what this phase delivers]

Success criteria:
- [ ] Task 1
- [ ] Task 2

Key interfaces:
```typescript
// src/path/to/file.ts
interface Example {
  field: string;
}
```

### Phase 2: [Title]
...
```

## Rules

1. Prefer the simplest solution that delivers end-to-end value. No "bicycle before car" — if a bicycle solves the problem, don't spec a car.
2. No speculative features or "we might need this later" configuration knobs.
3. Wait for a second concrete use case before introducing an abstraction.
4. Test the things most likely to be wrong, not the things most likely to be right.
5. If a phase can't be verified by a user action, redesign it.
