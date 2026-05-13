import { readFile } from "node:fs/promises";
import type { Spec, SpecPhase } from "./schema.js";

const SECTION_HEADER_RE = /^## (.*)$/;
const PHASE_HEADER_RE = /^### Phase \d+: (.*)$/;
const SUCCESS_CRITERIA_RE = /^- \[([ x])\] (.*)$/;
const CODE_BLOCK_RE = /^```(?:typescript|ts)?\s*\n?$/;
const GOAL_ITEM_RE = /^- (.*)$/;
const FILE_ITEM_RE = /^- `([^`]+)`/;

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

function parsePhase(lines: string[], startIdx: number): { phase: SpecPhase; endIdx: number } | null {
  const headerMatch = lines[startIdx].match(PHASE_HEADER_RE);
  if (!headerMatch) return null;
  const title = headerMatch[1];
  const descLines: string[] = [];
  let i = startIdx + 1;
  const criteria: string[] = [];
  let codeSample: { file: string; code: string } | undefined;

  while (i < lines.length) {
    const line = lines[i];
    if (PHASE_HEADER_RE.test(line) || SECTION_HEADER_RE.test(line)) break;

    const criteriaMatch = line.match(SUCCESS_CRITERIA_RE);
    if (criteriaMatch) {
      criteria.push(criteriaMatch[2]);
      i++;
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

  const phases: SpecPhase[] = [];
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
