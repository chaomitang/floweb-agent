export { SpecSchema, SpecPhaseSchema, SpecActionSchema, SpecAssertSchema } from "./schema.js";
export type { Spec, SpecPhase, SpecAction, SpecAssert, PhaseStatus } from "./schema.js";

export { parseSpec, parseSpecFile } from "./parser.js";
export { getPhaseStatuses, getProgress, getNextIncompletePhase, markPhaseComplete } from "./tracker.js";
export { validateSpec } from "./validator.js";
export type { ValidationIssue, ValidationReport } from "./validator.js";
