import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { SkillRegistry } from "@/skills/registry.js";

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
      description: "列出所有当前已加载的技能。",
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
      description: "按名称获取已加载技能的完整内容。",
      schema: z.object({
        name: z.string().describe("要查看的技能名称"),
      }),
    },
  );

  return [listSkills, describeSkill];
}
