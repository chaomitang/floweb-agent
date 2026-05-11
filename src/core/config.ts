import { z } from "zod";

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
});

export type FlowwebConfig = z.infer<typeof FlowwebConfigSchema>;

export function resolveConfig(input?: Partial<FlowwebConfig>): FlowwebConfig {
  return FlowwebConfigSchema.parse(input ?? {});
}
