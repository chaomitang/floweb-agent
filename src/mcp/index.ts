import { createInterface } from "node:readline";
import { DaemonClient } from "../daemon/ipc/client.js";
import { getDaemonSocketPath } from "../daemon/ipc/socket.js";
import { resolveConfig } from "../core/config.js";
import { getMcpTools, callTool } from "./tools.js";
import type { McpTool } from "./tools.js";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

function respond(id: number | string | undefined, result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function error(id: number | string | undefined, code: number, message: string): void {
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n",
  );
}

function log(msg: string): void {
  process.stderr.write(`[floweb mcp] ${msg}\n`);
}

export async function startMcpServer(sessionName?: string): Promise<void> {
  const config = resolveConfig();
  if (sessionName) {
    config.sessionName = sessionName;
  }

  const socketPath = getDaemonSocketPath(sessionName);

  log(`connecting to daemon (session: ${sessionName ?? "default"})...`);
  let client: DaemonClient;

  try {
    client = await DaemonClient.connect(socketPath, {
      pagesChanged() {},
      sessionStatusChanged() {},
      actionLogged() {},
      observingChanged() {},
    });
    log("connected to existing daemon");
  } catch {
    // 启动新的 daemon
    log("spawning daemon...");
    try {
      const spawned = await DaemonClient.spawn(config, {
        pagesChanged() {},
        sessionStatusChanged() {},
        actionLogged() {},
        observingChanged() {},
      });
      client = spawned.client;
      log(`daemon started (pid ${spawned.pid})`);
    } catch (err) {
      log(`failed to start daemon: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  const tools = getMcpTools();
  log(`ready, ${tools.length} tools available`);

  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on("line", async (line: string) => {
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line);
    } catch {
      return;
    }

    try {
      switch (req.method) {
        case "initialize":
          respond(req.id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "floweb", version: "0.1.0" },
          });
          break;

        case "tools/list":
          respond(req.id, {
            tools: tools.map((t: McpTool) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          });
          break;

        case "tools/call": {
          const params = req.params as { name: string; arguments?: Record<string, unknown> };
          if (!params?.name) {
            error(req.id, -32602, "Missing tool name");
            return;
          }
          const result = await callTool(client, params.name, params.arguments ?? {});
          respond(req.id, result);
          break;
        }

        case "notifications/initialized":
          break;

        default:
          error(req.id, -32601, `Method not found: ${req.method}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`error: ${msg}`);
      error(req.id, -32000, msg);
    }
  });

  rl.on("close", () => {
    log("stdin closed, exiting");
    client.destroy();
    process.exit(0);
  });
}
