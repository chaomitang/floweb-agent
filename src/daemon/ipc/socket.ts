import { createConnection, createServer } from "node:net";
import { unlink, stat } from "node:fs/promises";
import { userInfo } from "node:os";
import type { Socket, Server } from "node:net";
import type { IpcTransport, IpcProtocolMessage } from "./protocol.js";

// ─── JSON-line framing ───────────────────────────────────────────────

export function createJsonSocketTransport(socket: Socket): IpcTransport<IpcProtocolMessage> {
  let buffer = "";

  socket.setNoDelay(true);

  return {
    async send(message: IpcProtocolMessage) {
      const line = JSON.stringify(message) + "\n";
      return new Promise<void>((resolve, reject) => {
        socket.write(line, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    listen(callback: (message: IpcProtocolMessage) => void) {
      const onData = (chunk: Buffer | string) => {
        buffer += chunk.toString("utf-8");

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim() === "") continue;
          try {
            const message = JSON.parse(line) as IpcProtocolMessage;
            callback(message);
          } catch {
            // Skip malformed messages
          }
        }
      };

      socket.on("data", onData);

      return () => {
        socket.off("data", onData);
      };
    },

    onClose(callback: (error?: Error) => void) {
      const onError = (err: Error) => callback(err);
      const onEnd = () => callback();

      socket.on("error", onError);
      socket.on("end", onEnd);
      socket.on("close", onEnd);

      return () => {
        socket.off("error", onError);
        socket.off("end", onEnd);
        socket.off("close", onEnd);
      };
    },

    close() {
      socket.destroy();
    },
  };
}

// ─── Connection helpers ──────────────────────────────────────────────

export function connectToIpcSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);

    const onError = (err: Error) => {
      socket.destroy();
      reject(err);
    };

    socket.once("connect", () => {
      socket.off("error", onError);
      resolve(socket);
    });

    socket.once("error", onError);
  });
}

// ─── Server helpers ──────────────────────────────────────────────────

export type IpcConnectionHandler = (transport: IpcTransport<IpcProtocolMessage>) => void;

export function createIpcSocketServer(onConnection: IpcConnectionHandler): Server {
  return createServer((socket) => {
    const transport = createJsonSocketTransport(socket);
    onConnection(transport);
  });
}

export function listenOnIpcSocket(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

// ─── Socket file management ──────────────────────────────────────────

export async function removeStaleSocketFile(socketPath: string): Promise<void> {
  try {
    await stat(socketPath);
    // File exists — try to remove it (it's stale if we're starting fresh)
    await unlink(socketPath);
  } catch {
    // File doesn't exist, nothing to do
  }
}

export function getDaemonSocketPath(): string {
  const uid = userInfo().uid;
  return `/tmp/floweb-${uid}.sock`;
}
