import type { DaemonClient } from "../daemon/ipc/client.js";
import type { SkillRegistry } from "../skills/registry.js";

export type InteractionMode = "dialogue" | "observation";

export interface AgentConfig {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  skillsDir: string;
  specsDir: string;
  interactionMode: InteractionMode;
}

export interface AgentState {
  status: "idle" | "thinking" | "executing" | "error";
  mode: InteractionMode;
  error: string | null;
}

export interface AgentContext {
  client: DaemonClient;
  registry: SkillRegistry;
  config: AgentConfig;
}
