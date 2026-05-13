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
      description: "Create a new spec document in the specs directory.",
      schema: z.object({
        name: z.string().describe("The spec file name (e.g., 'add-login-feature')"),
        content: z.string().describe("The spec markdown content"),
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
      description: "Read a spec document's full content.",
      schema: z.object({
        name: z.string().describe("The spec file name to read"),
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
      description: "Update an existing spec document with new content.",
      schema: z.object({
        name: z.string().describe("The spec file name to update"),
        content: z.string().describe("The new full spec content"),
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
      description: "List all spec documents in the specs directory.",
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
      description: "Mark all success criteria in a spec phase as completed [x].",
      schema: z.object({
        specName: z.string().describe("The spec file name"),
        phaseTitle: z.string().describe("The phase title to mark complete"),
      }),
    },
  );

  return [createSpec, readSpec, updateSpec, listSpecs, markPhaseComplete];
}
