---
name: spec-review
description: Review a spec document for quality, completeness, and correctness before implementation begins. Use after a spec is written but before implementing.
---

# Spec Review

Review a spec document against three dimensions: under-specification, design-level bugs, and adherence to spec-writing rules.

## Process

### 1. Read the spec
Read the entire spec document to understand what it proposes.

### 2. Research the codebase
Read every file listed in the spec's "Important files" section. Understand the current state of the code the spec plans to modify.

### 3. Evaluate against three categories

#### Under-specified
Places where an implementer would have to guess:
- Ambiguous module/file names ("update the handler" — which handler?)
- Missing data shape descriptions when adding/changing schemas
- Undefined ownership of new interfaces between modules
- Missing error handling for expected failure modes
- Unclear sequencing between phases

#### Bugs (design-level logical errors)
- Phase N removes a concept that Phase N+2 depends on
- Spec contradicts itself (e.g., says "add calendar later" but removes the only calendar mechanism)
- Assumptions about data shapes that don't match the actual codebase
- Race conditions or ordering issues in event-driven designs
- Missing deduplication in batch processing

Do NOT flag things that tooling will catch: missing imports, type errors, exact function signatures, specific test assertion values.

#### Adherence to spec format
- Does the spec have all required sections?
- Is each phase commit-sized (< 100 lines)?
- Do success criteria verify things most likely to be wrong?
- Is there any over-engineering or speculative design?

### 4. Output format

```
# Spec Review: [spec-name]

## Under-specified
- [Issue with file/line reference]
- ...

## Bugs
- [Issue with reasoning]
- ...

## Adherence
- [Issue or confirmation]
- ...

## Verdict
[2-3 sentences: is this spec ready to implement? What must be fixed first?]
```

## Rules

1. Review the PLAN, not the implementation. The spec describes intent — evaluate that intent.
2. Don't flag missing imports or type details — the type-checker catches those.
3. Don't flag code style or formatting — the linter/formatter handles those.
4. Focus on what an implementer would trip over, not on polishing the prose.
