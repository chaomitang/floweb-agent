#!/usr/bin/env node
import { startTui } from "../tui/index.js";
import { parseCliArgs } from "./args.js";
import { resolveConfig } from "../core/config.js";
import { DaemonClient } from "../daemon/ipc/client.js";
import { getDaemonSocketPath } from "../daemon/ipc/socket.js";
import type { ClientApi } from "../daemon/ipc/api.js";

const noopHandlers: ClientApi = {
  pagesChanged() {},
  sessionStatusChanged() {},
};

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const socketPath = cliArgs.socketPath ?? getDaemonSocketPath();

  process.title = "flowweb";

  switch (cliArgs.subcommand) {
    case "daemon": {
      // Internal: spawned by child_process.fork — handled in daemon/daemon.ts
      console.error("The 'daemon' subcommand is for internal use only.");
      process.exit(1);
      break;
    }

    case "tui": {
      const config = resolveConfig(cliArgs);
      const { waitUntilExit } = startTui({ config, socketPath, initialUrl: cliArgs.url });
      try {
        await waitUntilExit();
      } catch (err) {
        console.error("Flowweb exited with an error:", err);
        process.exit(1);
      }
      break;
    }

    case "pages": {
      try {
        const client = await DaemonClient.connect(socketPath, noopHandlers);
        const pages = await client.remote.getPages();
        const activeId = await client.remote.getActivePageId();

        if (pages.length === 0) {
          console.log("No pages open.");
        } else {
          for (const page of pages) {
            const marker = page.id === activeId ? "*" : " ";
            console.log(`${marker} [${page.id}] ${page.title} — ${page.url}`);
          }
        }

        client.destroy();
      } catch (err) {
        console.error("Failed to connect to daemon:", err);
        process.exit(1);
      }
      break;
    }

    case "snapshot": {
      try {
        const client = await DaemonClient.connect(socketPath, noopHandlers);
        const pages = await client.remote.getPages();
        const activeId = await client.remote.getActivePageId();

        const output = {
          activePageId: activeId,
          pageCount: pages.length,
          pages,
        };

        console.log(JSON.stringify(output, null, 2));
        client.destroy();
      } catch (err) {
        console.error("Failed to connect to daemon:", err);
        process.exit(1);
      }
      break;
    }

    case "open": {
      const url = cliArgs.url;
      if (!url) {
        console.error("Usage: flowweb open <url>");
        process.exit(1);
      }

      try {
        const client = await DaemonClient.connect(socketPath, noopHandlers);
        await client.remote.createSession(url);
        console.log(`Opened: ${url}`);
        client.destroy();
      } catch {
        // No daemon running, spawn one
        const config = resolveConfig(cliArgs);
        const { client } = await DaemonClient.spawn(config, noopHandlers);
        await client.remote.createSession(url);
        console.log(`Started daemon and opened: ${url}`);
        client.destroy();
      }
      break;
    }

    case "close": {
      try {
        const client = await DaemonClient.connect(socketPath, noopHandlers);
        await client.remote.closeSession();
        console.log("Session closed.");
        client.destroy();
      } catch (err) {
        console.error("Failed to connect to daemon:", err);
        process.exit(1);
      }
      break;
    }
  }
}

main();
