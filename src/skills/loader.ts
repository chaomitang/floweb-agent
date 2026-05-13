import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { SkillMetaSchema } from "./types.js";
import type { Skill } from "./types.js";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { meta: {}, body: raw };
  }
  const yamlStr = match[1];
  const body = raw.slice(match[0].length);
  const meta: Record<string, unknown> = {};
  for (const line of yamlStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();
    if (typeof value === "string" && /^\d+$/.test(value)) {
      value = Number(value);
    } else if (value === "true") value = true;
    else if (value === "false") value = false;
    meta[key] = value;
  }
  return { meta, body };
}

export async function loadSkill(filePath: string): Promise<Skill> {
  const raw = await readFile(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);
  const parsedMeta = SkillMetaSchema.parse(meta);
  return {
    meta: parsedMeta,
    content: body.trim(),
    path: filePath,
  };
}

export async function loadSkillsFromDir(dir: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return skills;
  }
  for (const entry of entries) {
    const entryPath = join(dir, entry);
    const entryStat = await stat(entryPath);
    if (!entryStat.isDirectory()) continue;
    const skillFile = join(entryPath, "SKILL.md");
    try {
      await stat(skillFile);
      const skill = await loadSkill(skillFile);
      skills.push(skill);
    } catch {
      // skip directories without SKILL.md
    }
  }
  return skills;
}
