import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import {
  createJsonSocketTransport,
  connectToIpcSocket,
  createIpcSocketServer,
  listenOnIpcSocket,
  removeStaleSocketFile,
  getDaemonSocketPath,
} from "../../../src/daemon/ipc/socket.js";
import type { IpcProtocolMessage } from "../../../src/daemon/ipc/protocol.js";

function tmpSocketPath(): string {
  return join(tmpdir(), `floweb-test-${randomUUID()}.sock`);
}

describe("createJsonSocketTransport", () => {
  let socketPath: string;
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    for (const fn of cleanup) fn();
    cleanup.length = 0;
  });

  it("sends and receives JSON messages over a socket", async () => {
    socketPath = tmpSocketPath();
    const server = createServer((socket) => {
      const transport = createJsonSocketTransport(socket);
      transport.listen((msg) => {
        // Echo back with a response wrapper
        transport.send({
          type: "ipc-response",
          id: (msg as { id: string }).id ?? "unknown",
          method: (msg as { method: string }).method ?? "unknown",
          data: `echo: ${JSON.stringify((msg as { args: unknown[] }).args)}`,
        });
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    cleanup.push(() => {
      server.close();
      try { unlinkSync(socketPath); } catch { /* ok */ }
    });

    const socket = await connectToIpcSocket(socketPath);
    cleanup.push(() => socket.destroy());

    const transport = createJsonSocketTransport(socket);

    const received = new Promise<IpcProtocolMessage>((resolve) => {
      transport.listen(resolve);
    });

    const request: IpcProtocolMessage = {
      type: "ipc-request",
      id: "test-1",
      method: "ping",
      args: ["hello"],
    };

    await transport.send(request);
    const response = await received;

    expect(response.type).toBe("ipc-response");
    expect(response.id).toBe("test-1");
  });

  it("handles multiple messages in sequence", async () => {
    socketPath = tmpSocketPath();
    let msgCount = 0;
    const server = createServer((socket) => {
      const transport = createJsonSocketTransport(socket);
      transport.listen((msg) => {
        msgCount++;
        transport.send({
          type: "ipc-response",
          id: (msg as { id: string }).id,
          method: (msg as { method: string }).method,
          data: msgCount,
        });
      });
    });

    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    cleanup.push(() => {
      server.close();
      try { unlinkSync(socketPath); } catch { /* ok */ }
    });

    const socket = await connectToIpcSocket(socketPath);
    cleanup.push(() => socket.destroy());
    const transport = createJsonSocketTransport(socket);

    const responses: IpcProtocolMessage[] = [];
    transport.listen((msg) => responses.push(msg));

    await transport.send({ type: "ipc-request", id: "1", method: "a", args: [] });
    await transport.send({ type: "ipc-request", id: "2", method: "b", args: [] });
    await transport.send({ type: "ipc-request", id: "3", method: "c", args: [] });

    // Wait for async delivery
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(responses.length).toBe(3);
  });
});

describe("connectToIpcSocket", () => {
  it("rejects when no server is listening", async () => {
    const path = tmpSocketPath();
    await expect(connectToIpcSocket(path)).rejects.toThrow();
  });
});

describe("createIpcSocketServer / listenOnIpcSocket", () => {
  it("creates a server and accepts connections", async () => {
    const socketPath = tmpSocketPath();
    let connectionCount = 0;

    const server = createIpcSocketServer(() => {
      connectionCount++;
    });

    await listenOnIpcSocket(server, socketPath);

    const socket = await connectToIpcSocket(socketPath);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(connectionCount).toBe(1);

    socket.destroy();
    server.close();
    try { unlinkSync(socketPath); } catch { /* ok */ }
  });
});

describe("removeStaleSocketFile", () => {
  it("does not throw when file does not exist", async () => {
    const path = tmpSocketPath();
    await expect(removeStaleSocketFile(path)).resolves.toBeUndefined();
  });
});

describe("getDaemonSocketPath", () => {
  it("returns a path in /tmp with  prefix", () => {
    const path = getDaemonSocketPath();
    expect(path).toContain("/tmp/floweb-");
    expect(path).toContain(".sock");
  });
});
