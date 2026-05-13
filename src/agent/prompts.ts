import type { SkillRegistry } from "../skills/registry.js";

const BASE_PROMPT = `You are Flowweb Agent, a browser automation assistant with spec-driven development capabilities.

You have access to tools for browser control, spec management, and skill discovery.
When the user asks you to do something, use the appropriate tools to accomplish it.

Core principles:
- Be concise and direct. No filler text.
- When you can complete a task with tools, do so without asking for confirmation.
- When the approach is ambiguous, ask the user to clarify before acting.
- Report what you did and what you observed after tool use.
- If a tool fails, explain the error and suggest next steps.

Interaction modes:
- Dialogue mode: You respond to user messages and execute their requests.
- Observation mode: You observe browser state changes and provide guidance. The user operates the browser manually while you watch and suggest.`;

export function buildSystemPrompt(registry: SkillRegistry): string {
  const skills = registry.list();
  if (skills.length === 0) return BASE_PROMPT;

  const skillSections = skills.map(
    (s) => `## Skill: ${s.meta.name}\n${s.meta.description}\n\n${s.content}`,
  );

  return `${BASE_PROMPT}

---

# Loaded Skills

The following skills are loaded and available. Their instructions refine your behavior for specific tasks.

${skillSections.join("\n\n---\n\n")}`;
}

export function buildObservationPrompt(pageState: unknown): string {
  return `[Observation] Browser state changed:
${JSON.stringify(pageState, null, 2)}

The user is operating the browser manually. Based on the current state, provide a brief observation or suggestion. Keep it under 3 sentences unless the user asks for detail.`;
}
