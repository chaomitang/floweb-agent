import { randomUUID } from "node:crypto";
import type { Server } from "node:net";
import { BrowserManager, BrowserManagerEvents } from "../core/browser/manager.js";
import type { FlowwebConfig } from "../core/config.js";
import { writeSessionState } from "../core/session-state.js";
import { createIpcSocketServer, listenOnIpcSocket, removeStaleSocketFile } from "./ipc/socket.js";
import { createIpcPeer } from "./ipc/protocol.js";
import type { IpcPeer, IpcTransport, IpcProtocolMessage } from "./ipc/protocol.js";
import type { DaemonApi, ClientApi } from "./ipc/api.js";
import type { PageInfo } from "../core/types.js";

export class DaemonServer {
  private browserManager: BrowserManager;
  private config: FlowwebConfig;
  private server: Server | null = null;
  private clients = new Set<IpcPeer<ClientApi>>();
  private sessionId: string;

  constructor(browserManager: BrowserManager, config: FlowwebConfig) {
    this.browserManager = browserManager;
    this.config = config;
    this.sessionId = randomUUID();

    // Broadcast BrowserManager events to all connected clients + persist state
    this.browserManager.on(
      BrowserManagerEvents.PAGES_CHANGED,
      (pages: PageInfo[], activePageId: string | null) => {
        this.persistState();
        for (const client of this.clients) {
          try {
            void client.call.pagesChanged(pages, activePageId);
          } catch {
            // Client may have disconnected
          }
        }
      },
    );

    this.browserManager.on(
      BrowserManagerEvents.STATUS_CHANGED,
      (status: string) => {
        this.persistState();
        for (const client of this.clients) {
          try {
            void client.call.sessionStatusChanged(status);
          } catch {
            // Client may have disconnected
          }
        }
      },
    );
  }

  async start(socketPath: string): Promise<void> {
    await removeStaleSocketFile(socketPath);

    this.server = createIpcSocketServer((transport) => {
      this.handleConnection(transport);
    });

    await listenOnIpcSocket(this.server, socketPath);
    this.persistState();
  }

  private handleConnection(transport: IpcTransport<IpcProtocolMessage>): void {
    const handlers: { [K in keyof DaemonApi]: (...args: Parameters<DaemonApi[K]>) => ReturnType<DaemonApi[K]> } = {
      ping: () => ({ protocolVersion: 1 }),

      getPages: () => this.browserManager.getPageInfos(),

      getActivePageId: () => this.browserManager.getActivePageId(),

      switchToPage: (pageId: string) => {
        this.browserManager.switchToPage(pageId);
      },

      closePage: (pageId: string) => {
        return this.browserManager.closePage(pageId);
      },

      createSession: (url: string) => {
        return this.browserManager.createSession(this.config, url);
      },

      closeSession: () => {
        return this.browserManager.closeSession();
      },
    };

    const peer = createIpcPeer<ClientApi, DaemonApi>(transport, handlers);

    this.clients.add(peer);

    transport.onClose?.(() => {
      this.clients.delete(peer);
    });

    // Send current state to the new client
    const pages = this.browserManager.getPageInfos();
    const activePageId = this.browserManager.getActivePageId();
    void peer.call.pagesChanged(pages, activePageId);

    const status = this.browserManager.getSessionStatus();
    void peer.call.sessionStatusChanged(status);
  }

  private persistState(): void {
    try {
      writeSessionState(this.config.sessionDir, {
        version: 1 as const,
        sessionId: this.sessionId,
        pid: process.pid,
        pages: this.browserManager.getPageInfos(),
        activePageId: this.browserManager.getActivePageId(),
        startedAt: new Date().toISOString(),
        config: this.config,
      });
    } catch {
      // Best-effort persistence
    }
  }

  async stop(): Promise<void> {
    // Destroy all client peers
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    // Close the server
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Clean up browser
    await this.browserManager.dispose();
  }
}
