import { readFile } from "node:fs/promises";
import type { Spec, SpecPhase, SpecAction, SpecAssert } from "./schema.js";

const SECTION_HEADER_RE = /^## (.*)$/;
const PHASE_HEADER_RE = /^### Phase \d+: (.*)$/;
const SUCCESS_CRITERIA_RE = /^- \[([ x])\] (.*)$/;
const CODE_BLOCK_RE = /^```(?:typescript|ts)?\s*\n?$/;
const GOAL_ITEM_RE = /^- (.*)$/;
const FILE_ITEM_RE = /^- `([^`]+)`/;
const FENCE_RE = /^```\S*\s*$/;
const ACTIONS_MARKER = "**Actions:**";
const ASSERTS_MARKER = "**Asserts:**";

function parseListItems(lines: string[], startIdx: number): { items: string[]; endIdx: number } {
  const items: string[] = [];
  let i = startIdx;
  while (i < lines.length && lines[i].trim().startsWith("-")) {
    const match = lines[i].match(GOAL_ITEM_RE);
    if (match) items.push(match[1]);
    i++;
  }
  return { items, endIdx: i };
}

function parseFileItems(lines: string[], startIdx: number): { items: string[]; endIdx: number } {
  const items: string[] = [];
  let i = startIdx;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("-")) break;
    const match = trimmed.match(FILE_ITEM_RE);
    if (match) items.push(match[1]);
    i++;
  }
  return { items, endIdx: i };
}

function extractSection(
  lines: string[],
  startIdx: number,
  sectionName: string,
): string {
  const content: string[] = [];
  let i = startIdx;
  while (i < lines.length) {
    if (SECTION_HEADER_RE.test(lines[i])) break;
    content.push(lines[i]);
    i++;
  }
  return content.join("\n").trim();
}

function parseYamlActions(
  yamlLines: string[],
): SpecAction[] {
  const actions: SpecAction[] = [];
  let i = 0;
  while (i < yamlLines.length) {
    const trimmed = yamlLines[i].trim();
    if (trimmed.startsWith("- tool:")) {
      const tool = trimmed.slice(7).trim();
      const args: Record<string, unknown> = {};
      i++;
      // parse args block if present
      while (i < yamlLines.length) {
        const argLine = yamlLines[i];
        if (argLine.trim().startsWith("- tool:") || argLine.trim().startsWith("- condition:")) break;
        if (argLine.trim().startsWith("args:")) {
          i++;
          while (i < yamlLines.length) {
            const kvLine = yamlLines[i];
            if (!kvLine.startsWith("    ") && !kvLine.startsWith("\t")) break;
            const kv = kvLine.trim();
            const colonIdx = kv.indexOf(":");
            if (colonIdx > 0) {
              const key = kv.slice(0, colonIdx).trim();
              let val: unknown = kv.slice(colonIdx + 1).trim();
              // unquote string values
              if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
              }
              args[key] = val;
            }
            i++;
          }
          continue;
        }
        break;
      }
      actions.push({ tool, args });
    } else {
      i++;
    }
  }
  return actions;
}

function parseYamlAsserts(
  yamlLines: string[],
): SpecAssert[] {
  const asserts: SpecAssert[] = [];
  let current: { condition?: string; description?: string } | null = null;

  for (const line of yamlLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- condition:")) {
      if (current?.condition && current?.description) {
        asserts.push({ condition: current.condition, description: current.description });
      }
      current = { condition: trimmed.slice(12).trim() };
    } else if (trimmed.startsWith("description:") && current) {
      const desc = trimmed.slice(12).trim();
      current.description = desc.startsWith('"') && desc.endsWith('"') ? desc.slice(1, -1) : desc;
    }
  }
  if (current?.condition && current?.description) {
    asserts.push({ condition: current.condition, description: current.description });
  }
  return asserts;
}

function tryParseFencedYamlBlock(
  lines: string[],
  startIdx: number,
  marker: string,
): { block: string[]; endIdx: number } | null {
  if (lines[startIdx].trim() !== marker) return null;
  let i = startIdx + 1;
  // skip blank lines between marker and fence
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || !FENCE_RE.test(lines[i].trim())) return null;
  i++;
  const block: string[] = [];
  while (i < lines.length && !FENCE_RE.test(lines[i].trim())) {
    block.push(lines[i]);
    i++;
  }
  if (i < lines.length) i++; // consume closing ```
  return { block, endIdx: i };
}

function parsePhase(lines: string[], startIdx: number): { phase: SpecPhase; endIdx: number } | null {
  const headerMatch = lines[startIdx].match(PHASE_HEADER_RE);
  if (!headerMatch) return null;
  const title = headerMatch[1];
  const descLines: string[] = [];
  let i = startIdx + 1;
  const criteria: string[] = [];
  let codeSample: { file: string; code: string } | undefined;
  let actions: SpecAction[] | undefined;
  let asserts: SpecAssert[] | undefined;

  while (i < lines.length) {
    const line = lines[i];
    if (PHASE_HEADER_RE.test(line) || SECTION_HEADER_RE.test(line)) break;

    const criteriaMatch = line.match(SUCCESS_CRITERIA_RE);
    if (criteriaMatch) {
      criteria.push(criteriaMatch[2]);
      i++;
      continue;
    }

    // Check for **Actions:** / **Asserts:** markers followed by ```yaml block
    const actionsResult = tryParseFencedYamlBlock(lines, i, ACTIONS_MARKER);
    if (actionsResult) {
      actions = parseYamlActions(actionsResult.block);
      i = actionsResult.endIdx;
      continue;
    }

    const assertsResult = tryParseFencedYamlBlock(lines, i, ASSERTS_MARKER);
    if (assertsResult) {
      asserts = parseYamlAsserts(assertsResult.block);
      i = assertsResult.endIdx;
      continue;
    }

    if (line.trim().startsWith("```") && line.trim().length <= 5) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const firstLine = codeLines[0] ?? "";
      const fileMatch = firstLine.match(/\/\/ (src\/.*\.ts)/);
      codeSample = {
        file: fileMatch ? fileMatch[1] : "",
        code: codeLines.join("\n"),
      };
      continue;
    }

    descLines.push(line);
    i++;
  }

  return {
    phase: {
      title,
      description: descLines.join("\n").trim(),
      actions,
      asserts,
      successCriteria: criteria,
      codeSample,
    },
    endIdx: i,
  };
}

export async function parseSpecFile(path: string): Promise<Spec> {
  const raw = await readFile(path, "utf-8");
  return parseSpec(raw, path);
}

export function parseSpec(raw: string, path?: string): Spec {
  const lines = raw.split("\n");
  const name = path ? path.replace(/^.*\/|\.md$/g, "") : "unknown";

  const sections: Record<string, string> = {};
  let currentSection = "";
  const sectionContents: Record<string, string[]> = {};

  for (let i = 0; i < lines.length; i++) {
    const sectionMatch = lines[i].match(SECTION_HEADER_RE);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      sectionContents[currentSection] = [];
      continue;
    }
    if (currentSection) {
      sectionContents[currentSection].push(lines[i]);
    }
  }

  const getSection = (key: string): string =>
    (sectionContents[key] ?? []).join("\n").trim();

  // Also accept ## Phase N: as a top-level section header (for LLM-generated specs)
  // Extract the title from the section key ("phase 1: 打开 apple 中国官网" → "打开 Apple 中国官网")
  // and prepend a synthetic "### Phase N: title" line so parsePhase can handle it.
  const PHASE_SECTION_RE = /^phase (\d+): (.*)$/;
  const phaseSectionKeys = Object.keys(sectionContents).filter((k) => PHASE_SECTION_RE.test(k));
  const phaseSectionPhases: SpecPhase[] = [];
  for (const phaseKey of phaseSectionKeys) {
    const match = phaseKey.match(PHASE_SECTION_RE);
    if (!match) continue;
    const title = match[2];
    const contentLines = sectionContents[phaseKey];
    const syntheticHeader = `### Phase ${match[1]}: ${title}`;
    const phaseLines = [syntheticHeader, ...contentLines];
    const parsed = parsePhase(phaseLines, 0);
    if (parsed) {
      phaseSectionPhases.push(parsed.phase);
    }
    delete sectionContents[phaseKey];
  }

  const phases: SpecPhase[] = [...phaseSectionPhases];
  const implContent = sectionContents["implementation"] ?? [];
  for (let i = 0; i < implContent.length; i++) {
    const parsed = parsePhase(implContent, i);
    if (parsed) {
      phases.push(parsed.phase);
      i = parsed.endIdx - 1;
    }
  }

  const goalsSection = sectionContents["goals"] ?? [];
  const goals: string[] = [];
  for (const line of goalsSection) {
    const match = line.match(SUCCESS_CRITERIA_RE) ?? line.match(GOAL_ITEM_RE);
    if (match) goals.push(match[2] ?? match[1]);
  }

  const nonGoalsSection = sectionContents["non-goals"] ?? [];
  const nonGoals: string[] = [];
  for (const line of nonGoalsSection) {
    const match = line.match(GOAL_ITEM_RE);
    if (match) nonGoals.push(match[1]);
  }

  const filesSection = sectionContents["important files"] ?? sectionContents["important files/docs/websites for implementation"] ?? [];
  const { items: importantFiles } = parseFileItems(filesSection, 0);

  return {
    name,
    problemOverview: getSection("problem overview"),
    solutionOverview: getSection("solution overview"),
    goals,
    nonGoals,
    importantFiles,
    phases,
  };
}
