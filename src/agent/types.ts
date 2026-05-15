import type { DaemonClient } from "../daemon/ipc/client.js";
import type { SkillRegistry } from "../skills/registry.js";

export interface AgentConfig {
  provider: "anthropic" | "openai" | "deepseek";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  skillsDir: string;
  specsDir: string;
}

export interface AgentState {
  status: "idle" | "thinking" | "executing" | "error";
  error: string | null;
}

export interface AgentContext {
  client: DaemonClient;
  registry: SkillRegistry;
  config: AgentConfig;
}

export type AgentStreamEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; toolName: string; toolArgs: Record<string, unknown> }
  | { type: "tool_end"; toolName: string; result: string }
  | { type: "error"; message: string };
