import { z } from "zod";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FlowebConfigSchema = z.object({
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
  sessionDir: z.string().default(".floweb/sessions"),
  sessionName: z.string().default("default"),
  llm: z
    .object({
      provider: z.enum(["anthropic", "openai"]).default("openai"),
      model: z.string().default("claude-sonnet-4-20250514"),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      skillsDir: z.string().default(".floweb/skills"),
      specsDir: z.string().default("specs"),
    })
    .default({
      provider: "openai" as const,
      model: "deepseek-v4-pro",
      skillsDir: ".floweb/skills",
      specsDir: "specs",
    }),
});

export type FlowebConfig = z.infer<typeof FlowebConfigSchema>;

const CONFIG_DIR = join(homedir(), ".floweb");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getGlobalSkillsDir(): string {
  return join(CONFIG_DIR, "skills");
}

export function getSourceSkillsDir(): string {
  const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
  return join(packageRoot, "skills");
}

const DEFAULT_CONFIG_JSON = `{
  "llm": {
    "provider": "openai",
    "model": "deepseek-v4-pro",
    "apiKey": "",
    "baseUrl": "https://api.deepseek.com/v1"
  }
}
`;

export function initConfig(): string {
  const dir = getConfigDir();
  const path = getConfigPath();

  mkdirSync(dir, { recursive: true });

  if (!existsSync(path)) {
    writeFileSync(path, DEFAULT_CONFIG_JSON, "utf-8");
  }

  return path;
}

export function loadFileConfig(): Partial<FlowebConfig> {
  try {
    const path = getConfigPath();
    if (!existsSync(path)) return {};
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    return FlowebConfigSchema.partial().parse(parsed);
  } catch {
    return {};
  }
}

export function resolveConfig(input?: Partial<FlowebConfig>): FlowebConfig {
  const fileConfig = loadFileConfig();
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
  return FlowebConfigSchema.parse(merged);
}

export function getSessionDir(config: FlowebConfig): string {
  return join(config.sessionDir, config.sessionName);
}

export function getLogPath(): string {
  return join(getConfigDir(), "floweb.log");
}
