import type { Spec, PhaseStatus } from "./schema.js";

export function getPhaseStatuses(spec: Spec): PhaseStatus[] {
  return spec.phases.map((phase, index) => ({
    phaseIndex: index,
    title: phase.title,
    completed: phase.successCriteria.every((t) => t.startsWith("[x]")),
    tasks: phase.successCriteria.map((text) => ({
      text,
      done: text.startsWith("[x]"),
    })),
  }));
}

export function getProgress(spec: Spec): { completed: number; total: number; percent: number } {
  const statuses = getPhaseStatuses(spec);
  const completed = statuses.filter((s) => s.completed).length;
  const total = statuses.length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function getNextIncompletePhase(spec: Spec): { index: number; title: string } | null {
  const statuses = getPhaseStatuses(spec);
  const next = statuses.find((s) => !s.completed);
  return next ? { index: next.phaseIndex, title: next.title } : null;
}

export function markPhaseComplete(spec: Spec, phaseIndex: number): Spec {
  const updated = { ...spec, phases: [...spec.phases] };
  const phase = { ...updated.phases[phaseIndex] };
  phase.successCriteria = phase.successCriteria.map((t) =>
    t.startsWith("[ ]") ? t.replace("[ ]", "[x]") : t,
  );
  updated.phases[phaseIndex] = phase;
  return updated;
}
