import { z } from "zod";

export type Subcommand = "tui" | "open" | "snapshot" | "pages" | "close" | "daemon";

export const CliArgsSchema = z.object({
  subcommand: z
    .enum(["tui", "open", "snapshot", "pages", "close", "daemon"])
    .default("tui"),
  url: z.string().optional(),
  socketPath: z.string().optional(),
  headless: z.boolean().default(false),
  provider: z.string().optional(),
  browserType: z.enum(["chromium", "firefox", "webkit"]).optional(),
  config: z.string().optional(), // JSON string for daemon subcommand
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

const SUBCOMMANDS: readonly string[] = ["tui", "open", "snapshot", "pages", "close", "daemon"];

export function parseCliArgs(rawArgs: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  let posIdx = 0;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    // First positional arg is the subcommand
    if (posIdx === 0 && !arg.startsWith("-") && SUBCOMMANDS.includes(arg)) {
      args["subcommand"] = arg;
      posIdx++;
      continue;
    }

    // "open" subcommand: next positional arg is url
    if (args["subcommand"] === "open" && posIdx === 1 && !arg.startsWith("-")) {
      args["url"] = arg;
      posIdx++;
      continue;
    }

    // Named flags
    if (arg === "--headless") {
      args["headless"] = true;
    } else if (arg === "--socket-path" && i + 1 < rawArgs.length) {
      args["socketPath"] = rawArgs[++i];
    } else if (arg === "--provider" && i + 1 < rawArgs.length) {
      args["provider"] = rawArgs[++i];
    } else if (arg === "--browser-type" && i + 1 < rawArgs.length) {
      args["browserType"] = rawArgs[++i];
    } else if (arg === "--config" && i + 1 < rawArgs.length) {
      args["config"] = rawArgs[++i];
    } else if (!arg.startsWith("-")) {
      posIdx++;
    }
  }

  return CliArgsSchema.parse(args);
}
