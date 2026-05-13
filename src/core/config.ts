import { z } from "zod";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

export const FlowwebConfigSchema = z.object({
  provider: z.string().default("anthropic"),
  headless: z.boolean().default(false),
  browserType: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  viewport: z
    .object({
      width: z.number().int().min(1).default(1280),
      height: z.number().int().min(1).default(720),
    })
    .default({ width: 1280, height: 720 }),
  logLevel: z.enum(["info", "warn", "error"]).default("info"),
  sessionDir: z.string().default(".flowweb/sessions"),
  sessionName: z.string().default("default"),
  // LLM / Agent config
  llm: z
    .object({
      model: z.string().default("claude-sonnet-4-20250514"),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      skillsDir: z.string().default(".claude/skills"),
      specsDir: z.string().default("specs"),
      interactionMode: z.enum(["dialogue", "observation"]).default("dialogue"),
    })
    .default({
      model: "claude-sonnet-4-20250514",
      skillsDir: ".claude/skills",
      specsDir: "specs",
      interactionMode: "dialogue" as const,
    }),
});

export type FlowwebConfig = z.infer<typeof FlowwebConfigSchema>;

const CONFIG_PATH = join(homedir(), ".flowweb", "config.json");

export function loadFileConfig(): Partial<FlowwebConfig> {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    // Validate only known keys, ignore extras
    return FlowwebConfigSchema.partial().parse(parsed);
  } catch {
    return {};
  }
}

export function resolveConfig(input?: Partial<FlowwebConfig>): FlowwebConfig {
  const fileConfig = loadFileConfig();
  // Deep merge: file config as base, input overrides
  const merged: Record<string, unknown> = { ...fileConfig };
  if (input) {
    for (const [key, value] of Object.entries(input)) {
      if (key === "llm" && typeof value === "object" && value !== null) {
        const fileLlm = (fileConfig.llm ?? {}) as Record<string, unknown>;
        merged[key] = { ...fileLlm, ...(value as Record<string, unknown>) };
      } else if (value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return FlowwebConfigSchema.parse(merged);
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getSessionDir(config: FlowwebConfig): string {
  return join(config.sessionDir, config.sessionName);
}
