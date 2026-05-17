import { z } from "zod";

export const SpecActionSchema = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export type SpecAction = z.infer<typeof SpecActionSchema>;

export const SpecAssertSchema = z.object({
  condition: z.string(),
  description: z.string(),
});

export type SpecAssert = z.infer<typeof SpecAssertSchema>;

export const SpecPhaseSchema = z.object({
  title: z.string(),
  description: z.string(),
  actions: z.array(SpecActionSchema).optional(),
  asserts: z.array(SpecAssertSchema).optional(),
  successCriteria: z.array(z.string()),
  codeSample: z
    .object({
      file: z.string(),
      code: z.string(),
    })
    .optional(),
});

export type SpecPhase = z.infer<typeof SpecPhaseSchema>;

export const SpecSchema = z.object({
  name: z.string(),
  problemOverview: z.string(),
  solutionOverview: z.string(),
  goals: z.array(z.string()),
  nonGoals: z.array(z.string()),
  importantFiles: z.array(z.string()),
  phases: z.array(SpecPhaseSchema),
});

export type Spec = z.infer<typeof SpecSchema>;

export interface PhaseStatus {
  phaseIndex: number;
  title: string;
  completed: boolean;
  tasks: { text: string; done: boolean }[];
}
