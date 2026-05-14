#!/usr/bin/env node
import { startTui } from "../tui/index.js";
import { startMcpServer } from "../mcp/index.js";
import { parseCliArgs } from "./args.js";
import { resolveConfig, initConfig, getGlobalSkillsDir } from "../core/config.js";
import { ensureSkillsInstalled } from "../skills/install.js";
import { DaemonClient } from "../daemon/ipc/client.js";
import { getDaemonSocketPath } from "../daemon/ipc/socket.js";
import type { ClientApi } from "../daemon/ipc/api.js";

const noopHandlers: ClientApi = {
  pagesChanged() {},
  sessionStatusChanged() {},
  actionLogged() {},
};

async function execAndPrint(socketPath: string, code: string) {
  const client = await DaemonClient.connect(socketPath, noopHandlers);
  try {
    const { output, result, diff } = await client.remote.execCode(code);
    if (output) console.log(output.trim());
    if (result !== undefined) console.log("=>", result);
    if (diff) console.log("\n--- Snapshot Diff ---\n" + diff);
  } finally {
    client.destroy();
  }
}

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const socketPath = cliArgs.socketPath ?? getDaemonSocketPath();

  initConfig();
  ensureSkillsInstalled(getGlobalSkillsDir());

  process.title = "floweb";

  switch (cliArgs.subcommand) {
    case "daemon": {
      // Internal: spawned by child_process.fork — handled in daemon/daemon.ts
      console.error("The 'daemon' subcommand is for internal use only.");
      process.exit(1);
      break;
    }

    case "setup": {
      const { homedir } = await import("node:os");
      const { join, dirname } = await import("node:path");
      const { existsSync } = await import("node:fs");

      const KNOWN_TARGETS: Record<string, string> = {
        claude: join(homedir(), ".claude", "skills"),
        codex: join(homedir(), ".codex", "skills"),
        opencode: join(homedir(), ".opencode", "skills"),
      };

      const install = (dest: string) => {
        ensureSkillsInstalled(dest);
        console.log(`  -> ${dest}`);
      };

      const target = cliArgs.target;

      if (target) {
        // Named target or custom path
        const dest = KNOWN_TARGETS[target] ?? target;
        console.log(`Installing floweb skills to:`);
        install(dest);
      } else {
        // Install to all known targets whose parent config dir exists
        const found = Object.entries(KNOWN_TARGETS).filter(([, dest]) =>
          existsSync(dirname(dest)),
        );
        if (found.length === 0) {
          console.log("No known agent config directories found.");
          console.log("Usage: floweb setup [claude|codex|opencode|<path>]");
        } else {
          console.log(`Installing floweb skills to ${found.length} target(s):`);
          for (const [, dest] of found) install(dest);
        }
      }
      break;
    }

    case "exec": {
      const code = cliArgs.code;
      if (!code) {
        // Read from stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
        const input = Buffer.concat(chunks).toString().trim();
        if (!input) { console.error("Usage: floweb exec <code> or echo <code> | floweb exec"); process.exit(1); }
        await execAndPrint(socketPath, input);
      } else {
        await execAndPrint(socketPath, code);
      }
      break;
    }

    case "run": {
      const file = cliArgs.file;
      if (!file) { console.error("Usage: floweb run <file>"); process.exit(1); }
      // Execute the script as a child process, passing daemon socket path
      const { fork } = await import("node:child_process");
      const child = fork(file, [], {
        env: { ...process.env, FLOWEB_SOCKET: socketPath },
        stdio: "inherit",
      });
      await new Promise<void>((resolve) => child.on("exit", () => resolve()));
      break;
    }

    case "tui": {
      const config = resolveConfig(cliArgs);
      const { waitUntilExit } = startTui({
        config,
        socketPath,
        sessionName: cliArgs.sessionName,
      });
      try {
        await waitUntilExit();
      } catch (err) {
        console.error("Floweb exited with an error:", err);
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
        console.error("Usage: floweb open <url>");
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
