import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

export function createSpecTools(specsDir: string) {
  const resolvePath = (name: string) => join(specsDir, name.endsWith(".md") ? name : `${name}.md`);

  const createSpec = tool(
    async ({ name, content }: { name: string; content: string }) => {
      await mkdir(specsDir, { recursive: true });
      const path = resolvePath(name);
      await writeFile(path, content, "utf-8");
      return `Spec created at ${path}`;
    },
    {
      name: "spec_create",
      description: "在 specs 目录中创建新的 spec 文档。",
      schema: z.object({
        name: z.string().describe("spec 文件名（如 'add-login-feature'）"),
        content: z.string().describe("spec 的 Markdown 内容"),
      }),
    },
  );

  const readSpec = tool(
    async ({ name }: { name: string }) => {
      const path = resolvePath(name);
      return await readFile(path, "utf-8");
    },
    {
      name: "spec_read",
      description: "读取一个 spec 文档的完整内容。",
      schema: z.object({
        name: z.string().describe("要读取的 spec 文件名"),
      }),
    },
  );

  const updateSpec = tool(
    async ({ name, content }: { name: string; content: string }) => {
      const path = resolvePath(name);
      await writeFile(path, content, "utf-8");
      return `Spec updated at ${path}`;
    },
    {
      name: "spec_update",
      description: "用新内容更新已有的 spec 文档。",
      schema: z.object({
        name: z.string().describe("要更新的 spec 文件名"),
        content: z.string().describe("新的完整 spec 内容"),
      }),
    },
  );

  const listSpecs = tool(
    async () => {
      try {
        const files = await readdir(specsDir);
        const specs = files.filter((f) => f.endsWith(".md"));
        if (specs.length === 0) return "No specs found.";
        return specs.map((s) => `- ${s}`).join("\n");
      } catch {
        return "No specs directory found. Create one with spec_create.";
      }
    },
    {
      name: "spec_list",
      description: "列出 specs 目录中所有 spec 文档。",
      schema: z.object({}),
    },
  );

  const markPhaseComplete = tool(
    async ({ specName, phaseTitle }: { specName: string; phaseTitle: string }) => {
      const path = resolvePath(specName);
      let content = await readFile(path, "utf-8");
      const phaseHeader = `### Phase`;
      const lines = content.split("\n");
      let inTargetPhase = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(phaseHeader) && lines[i].includes(phaseTitle)) {
          inTargetPhase = true;
          continue;
        }
        if (inTargetPhase && lines[i].startsWith("### Phase")) {
          break;
        }
        if (inTargetPhase && lines[i].match(/^- \[ \]/)) {
          lines[i] = lines[i].replace("- [ ]", "- [x]");
        }
      }
      await writeFile(path, lines.join("\n"), "utf-8");
      return `Marked tasks complete in phase "${phaseTitle}" of ${specName}`;
    },
    {
      name: "spec_mark_phase_complete",
      description: "将 spec 某个阶段的所有成功标准标记为已完成 [x]。",
      schema: z.object({
        specName: z.string().describe("spec 文件名"),
        phaseTitle: z.string().describe("要标记完成的阶段标题"),
      }),
    },
  );

  return [createSpec, readSpec, updateSpec, listSpecs, markPhaseComplete];
}
