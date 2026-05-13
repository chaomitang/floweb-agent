import { z } from "zod";

export const SkillMetaSchema = z.object({
  name: z.string(),
  description: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SkillMeta = z.infer<typeof SkillMetaSchema>;

export interface Skill {
  meta: SkillMeta;
  content: string;
  path: string;
}

export interface SkillMatch {
  skill: Skill;
  score: number;
}
