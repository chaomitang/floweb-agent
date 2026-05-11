import { resolveConfig } from "../core/config.js";
import { BrowserManager } from "../core/browser/manager.js";
import { getDaemonSocketPath } from "./ipc/socket.js";
import { DaemonServer } from "./server.js";

async function main(): Promise<void> {
  // 1. Parse config from fork IPC argument
  const configJson = process.argv[2];
  if (!configJson) {
    console.error("Usage: daemon <config-json>");
    process.exit(1);
  }

  let config;
  try {
    const raw = JSON.parse(configJson);
    config = resolveConfig(raw);
  } catch (err) {
    console.error("Failed to parse config:", err);
    process.exit(1);
  }

  // 2. Create BrowserManager
  const browserManager = new BrowserManager();

  // 3. Create DaemonServer and bind to socket
  const socketPath = getDaemonSocketPath();
  const daemonServer = new DaemonServer(browserManager, config);

  await daemonServer.start(socketPath);

  // 4. Notify parent process that we're ready
  if (process.send) {
    process.send({ type: "ready", socketPath });
  }

  // 5. Graceful shutdown
  const shutdown = async () => {
    await daemonServer.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("disconnect", shutdown);
}

main().catch((err) => {
  console.error("Daemon fatal error:", err);
  process.exit(1);
});
