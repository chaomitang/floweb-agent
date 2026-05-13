import type { Spec } from "./schema.js";

export interface ValidationIssue {
  severity: "error" | "warning";
  category: "under-specified" | "bug" | "adherence";
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}

const REQUIRED_SECTIONS = [
  "problem overview",
  "solution overview",
  "goals",
  "non-goals",
  "implementation",
];

const MAX_PHASE_LINES = 100;

export function validateSpec(spec: Spec): ValidationReport {
  const issues: ValidationIssue[] = [];

  // Check required sections exist
  const rawSections = [spec.problemOverview, spec.solutionOverview].filter(Boolean);
  for (const section of REQUIRED_SECTIONS) {
    if (section === "implementation") {
      if (spec.phases.length === 0) {
        issues.push({
          severity: "error",
          category: "adherence",
          message: "Spec must have at least one implementation phase",
        });
      }
    }
  }

  // Check goals are non-empty
  if (spec.goals.length === 0) {
    issues.push({
      severity: "error",
      category: "under-specified",
      message: "Goals section is empty. Spec must define at least one goal.",
    });
  }

  // Check goals use checkbox format
  for (const goal of spec.goals) {
    if (!goal.match(/^- \[[ x]\]/)) {
      issues.push({
        severity: "warning",
        category: "adherence",
        message: `Goal not in checkbox format: "${goal.slice(0, 60)}..."`,
      });
    }
  }

  // Validate each phase
  for (let i = 0; i < spec.phases.length; i++) {
    const phase = spec.phases[i];

    if (phase.successCriteria.length === 0) {
      issues.push({
        severity: "error",
        category: "under-specified",
        message: `Phase ${i + 1} "${phase.title}" has no success criteria`,
      });
    }

    const phaseLines = phase.description.split("\n").length + phase.successCriteria.length;
    if (phaseLines > MAX_PHASE_LINES) {
      issues.push({
        severity: "warning",
        category: "adherence",
        message: `Phase ${i + 1} "${phase.title}" is ${phaseLines} lines (target < ${MAX_PHASE_LINES})`,
      });
    }

    if (!phase.description.trim()) {
      issues.push({
        severity: "warning",
        category: "under-specified",
        message: `Phase ${i + 1} "${phase.title}" has no description`,
      });
    }
  }

  // Check non-goals are present
  if (spec.nonGoals.length === 0) {
    issues.push({
      severity: "warning",
      category: "under-specified",
      message: "Consider adding non-goals to scope the spec",
    });
  }

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
  };
}
