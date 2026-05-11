#!/usr/bin/env node
import { startTui } from "../tui/index.js";
import { parseCliArgs } from "./args.js";
import { resolveConfig } from "../core/config.js";

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const config = resolveConfig(cliArgs);
  process.title = "flowweb";
  console.log(`Starting flowweb with config: ${JSON.stringify(config)}`);

  const { waitUntilExit } = startTui(config);

  try {
    await waitUntilExit();
  } catch (err) {
    console.error("Flowweb exited with an error:", err);
    process.exit(1);
  }
}

main();
