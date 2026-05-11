import { z } from "zod";

export const CliArgsSchema = z.object({
  headless: z.boolean().default(false),
  provider: z.string().optional(),
  browserType: z.enum(["chromium", "firefox", "webkit"]).optional(),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

export function parseCliArgs(rawArgs: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--headless") {
      args["headless"] = true;
    } else if (arg === "--provider" && i + 1 < rawArgs.length) {
      args["provider"] = rawArgs[++i];
    } else if (arg === "--browser-type" && i + 1 < rawArgs.length) {
      args["browserType"] = rawArgs[++i];
    }
  }

  return CliArgsSchema.parse(args);
}
