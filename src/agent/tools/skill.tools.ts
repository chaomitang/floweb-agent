import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { SkillRegistry } from "../../skills/registry.js";

export function createSkillTools(getRegistry: () => SkillRegistry | null) {
  const registry = () => {
    const r = getRegistry();
    if (!r) throw new Error("Skill registry not available");
    return r;
  };

  const listSkills = tool(
    async () => {
      const names = registry().listNames();
      if (names.length === 0) return "No skills loaded.";
      return names.map((n) => `- ${n}`).join("\n");
    },
    {
      name: "skill_list",
      description: "List all currently loaded skills.",
      schema: z.object({}),
    },
  );

  const describeSkill = tool(
    async ({ name }: { name: string }) => {
      const skill = registry().get(name);
      if (!skill) return `Skill "${name}" not found. Use skill_list to see available skills.`;
      return `# ${skill.meta.name}\n\n${skill.meta.description}\n\n${skill.content}`;
    },
    {
      name: "skill_describe",
      description: "Get the full content of a loaded skill by name.",
      schema: z.object({
        name: z.string().describe("The skill name to describe"),
      }),
    },
  );

  return [listSkills, describeSkill];
}
