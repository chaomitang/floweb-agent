import { fork, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { connectToIpcSocket, createJsonSocketTransport } from "./socket.js";
import { createIpcPeer } from "./protocol.js";
import type { IpcPeer } from "./protocol.js";
import type { DaemonApi, ClientApi, DaemonReadyMessage } from "./api.js";
import type { FlowwebConfig } from "../../core/config.js";

export type DaemonClientOptions = {
  timeoutMs?: number;
};

export class DaemonClient {
  readonly remote: IpcPeer<DaemonApi>["call"];
  private peer: IpcPeer<DaemonApi>;

  private constructor(peer: IpcPeer<DaemonApi>) {
    this.peer = peer;
    this.remote = peer.call;
  }

  /**
   * Connect to an already-running daemon process via Unix socket.
   */
  static async connect(
    socketPath: string,
    handlers: ClientApi,
    options?: DaemonClientOptions,
  ): Promise<DaemonClient> {
    const socket = await connectToIpcSocket(socketPath);
    const transport = createJsonSocketTransport(socket);

    const peer = createIpcPeer<DaemonApi, ClientApi>(transport, handlers, {
      timeoutMs: options?.timeoutMs,
    });

    // Verify the connection by pinging the daemon
    await peer.call.ping();

    return new DaemonClient(peer);
  }

  /**
   * Start a new daemon process via child_process.fork and connect to it.
   */
  static async spawn(
    config: FlowwebConfig,
    handlers: ClientApi,
    options?: DaemonClientOptions,
  ): Promise<{ pid: number; socketPath: string; client: DaemonClient }> {
    const require = createRequire(import.meta.url);
    const daemonEntry = require.resolve("../daemon.js");

    const child: ChildProcess = fork(daemonEntry, [JSON.stringify(config)], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    // Wait for the ready signal from the daemon
    const readyMessage = await new Promise<DaemonReadyMessage>((resolve, reject) => {
      const onMessage = (msg: unknown) => {
        const message = msg as DaemonReadyMessage;
        if (message.type === "ready") {
          child.off("message", onMessage);
          resolve(message);
        }
      };

      const onError = (err: Error) => {
        child.off("message", onMessage);
        reject(err);
      };

      const onExit = (code: number | null) => {
        child.off("message", onMessage);
        reject(new Error(`Daemon process exited with code ${code} before sending ready signal`));
      };

      child.on("message", onMessage);
      child.once("error", onError);
      child.once("exit", onExit);
    });

    const socketPath = readyMessage.socketPath;

    // Connect to the daemon's socket
    const client = await DaemonClient.connect(socketPath, handlers, options);

    if (!child.pid) {
      throw new Error("Daemon process has no PID");
    }

    return { pid: child.pid, socketPath, client };
  }

  /**
   * Clean up the IPC connection.
   */
  destroy(): void {
    this.peer.destroy();
  }
}
