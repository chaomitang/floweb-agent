import { createInterface } from "node:readline";
import { DaemonClient } from "../daemon/ipc/client.js";
import { getDaemonSocketPath } from "../daemon/ipc/socket.js";
import { resolveConfig } from "../core/config.js";
import { initConfig } from "../core/config.js";
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

export async function startMcpServer(): Promise<void> {
  const config = resolveConfig();
  initConfig();

  let client: DaemonClient;
  try {
    client = await DaemonClient.connect(getDaemonSocketPath(), {
      pagesChanged() {},
      sessionStatusChanged() {},
      actionLogged() {},
    });
  } catch {
    // Spawn daemon if not running
    const spawned = await DaemonClient.spawn(config, {
      pagesChanged() {},
      sessionStatusChanged() {},
      actionLogged() {},
    });
    client = spawned.client;
  }

  const tools = getMcpTools();

  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (line: string) => {
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line);
    } catch {
      return; // skip malformed input
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
          respond(req.id, { tools: tools.map((t: McpTool) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })) });
          break;

        case "tools/call": {
          const params = req.params as { name: string; arguments?: Record<string, unknown> };
          if (!params?.name) {
            error(req.id, -32602, "Missing tool name");
            return;
          }
          const result = await callTool(client.remote, params.name, params.arguments ?? {});
          respond(req.id, result);
          break;
        }

        case "notifications/initialized":
          // No response needed for notifications
          break;

        default:
          error(req.id, -32601, `Method not found: ${req.method}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(req.id, -32000, msg);
    }
  });

  // Send a ready notification (optional but helpful for debugging)
  process.stderr.write("floweb MCP server ready\n");
}
