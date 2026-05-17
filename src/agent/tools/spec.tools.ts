import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface SpecExecutor {
  /** Execute a single browser action (e.g. browser_click) and return when done. Throws on failure. */
  executeAction(tool: string, args: Record<string, unknown>): Promise<void>;
  /** Execute a single assertion condition. Returns the assertion result text (PASS or FAIL with context). Throws on hard failure. */
  executeAssert(condition: string, description: string, stopOnFail: boolean): Promise<string>;
  /** Save a checkpoint for the given phase. Called after all actions and asserts pass. */
  saveCheckpoint(phaseIndex: number, phaseTitle: string): Promise<void>;
}

export function createSpecTools(specsDir: string, executor?: SpecExecutor) {
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

      // If executor is available, execute the phase's actions and asserts before marking complete
      if (executor) {
        const { parseSpec } = await import("../../spec/parser.js");
        const spec = parseSpec(content, specName);
        const phase = spec.phases.find((p) => p.title === phaseTitle);

        if (!phase) {
          throw new Error(
            `Phase "${phaseTitle}" not found in spec "${specName}". ` +
            `Available phases: ${spec.phases.map((p) => `"${p.title}"`).join(", ")}`,
          );
        }

        const results: string[] = [];

        // Execute actions
        if (phase.actions && phase.actions.length > 0) {
          results.push(`Executing ${phase.actions.length} action(s)...`);
          for (let i = 0; i < phase.actions.length; i++) {
            const action = phase.actions[i];
            try {
              await executor.executeAction(action.tool, action.args);
              results.push(`  ✓ Action ${i + 1}/${phase.actions.length}: ${action.tool}`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              throw new Error(
                [
                  `Phase "${phaseTitle}" FAILED at action ${i + 1}/${phase.actions.length}: ${action.tool}`,
                  `  Error: ${msg}`,
                  `  Actions 1–${i} succeeded.`,
                  `  Remaining ${phase.actions.length - i} actions were not executed.`,
                  "",
                  `Fix the issue and call spec_mark_phase_complete again to retry from this phase.`,
                ].join("\n"),
              );
            }
          }
        }

        // Execute asserts
        if (phase.asserts && phase.asserts.length > 0) {
          results.push(`Verifying ${phase.asserts.length} assertion(s)...`);
          for (let i = 0; i < phase.asserts.length; i++) {
            const assertion = phase.asserts[i];
            try {
              const result = await executor.executeAssert(
                assertion.condition,
                assertion.description,
                false, // soft assert — report failure but don't stop
              );
              if (result.startsWith("✗")) {
                throw new Error(result);
              }
              results.push(`  ✓ Assert ${i + 1}/${phase.asserts.length}: ${assertion.description}`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              throw new Error(
                [
                  `Phase "${phaseTitle}" FAILED at assertion ${i + 1}/${phase.asserts.length}: ${assertion.description}`,
                  ``,
                  msg,
                  ``,
                  `Actions ${phase.actions?.length ?? 0} succeeded.`,
                  `Fix the issue and call spec_mark_phase_complete again to retry from this phase.`,
                ].join("\n"),
              );
            }
          }
        }

        if (results.length > 0) {
          results.push(
            `Phase "${phaseTitle}" complete: ${phase.actions?.length ?? 0} actions, ${phase.asserts?.length ?? 0} assertions passed.`,
          );
        }

        // Save checkpoint after successful phase
        const phaseIdx = spec.phases.indexOf(phase);
        await executor.saveCheckpoint(phaseIdx, phaseTitle);
        results.push(`Checkpoint saved for phase ${phaseIdx + 1}/${spec.phases.length}.`);
      }

      // Mark success criteria as [x]
      const phaseHeader = "### Phase";
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

      if (executor) {
        return `Marked phase "${phaseTitle}" complete in ${specName}.`;
      }
      return `Marked tasks complete in phase "${phaseTitle}" of ${specName}.`;
    },
    {
      name: "spec_mark_phase_complete",
      description: "将 spec 某个阶段的所有成功标准标记为已完成 [x]。如果 spec 包含 actions 和 asserts，会自动执行后再标记完成。",
      schema: z.object({
        specName: z.string().describe("spec 文件名"),
        phaseTitle: z.string().describe("要标记完成的阶段标题"),
      }),
    },
  );

  return [createSpec, readSpec, updateSpec, listSpecs, markPhaseComplete];
}
