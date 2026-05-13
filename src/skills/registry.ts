import type { Skill, SkillMatch } from "./types.js";
import { loadSkillsFromDir } from "./loader.js";

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private dirs: string[] = [];

  async loadFromDir(dir: string): Promise<number> {
    this.dirs.push(dir);
    const skills = await loadSkillsFromDir(dir);
    for (const skill of skills) {
      this.skills.set(skill.meta.name, skill);
    }
    return skills.length;
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  listNames(): string[] {
    return Array.from(this.skills.keys());
  }

  match(query: string): SkillMatch[] {
    const lowerQuery = query.toLowerCase();
    const results: SkillMatch[] = [];
    for (const skill of this.skills.values()) {
      const nameLower = skill.meta.name.toLowerCase();
      const descLower = skill.meta.description.toLowerCase();
      let score = 0;
      if (nameLower === lowerQuery) {
        score = 100;
      } else if (nameLower.includes(lowerQuery)) {
        score = 80;
      } else if (descLower.includes(lowerQuery)) {
        score = 50;
      } else {
        const words = lowerQuery.split(/\s+/);
        const matchedWords = words.filter(
          (w) => nameLower.includes(w) || descLower.includes(w),
        );
        score = matchedWords.length * 20;
      }
      if (score > 0) {
        results.push({ skill, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  buildSystemPrompt(): string {
    const parts: string[] = [];
    for (const skill of this.skills.values()) {
      parts.push(`# ${skill.meta.name}\n${skill.meta.description}\n\n${skill.content}`);
    }
    return parts.join("\n\n---\n\n");
  }
}
