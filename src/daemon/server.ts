import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:net";
import { BrowserManager, BrowserManagerEvents } from "../core/browser/manager.js";
import type { FlowebConfig } from "../core/config.js";
import { getSessionDir } from "../core/config.js";
import { writeSessionState } from "../core/session-state.js";
import { listSessions, deleteSessionDir } from "../core/session-manager.js";
import { appendAction, clearActions } from "../core/session-logs.js";
import { createIpcSocketServer, listenOnIpcSocket, removeStaleSocketFile } from "./ipc/socket.js";
import { createIpcPeer } from "./ipc/protocol.js";
import type { IpcPeer, IpcTransport, IpcProtocolMessage } from "./ipc/protocol.js";
import type { DaemonApi, ClientApi } from "./ipc/api.js";
import type { PageInfo } from "../core/types.js";

export class DaemonServer {
  private browserManager: BrowserManager;
  private config: FlowebConfig;
  private server: Server | null = null;
  private clients = new Set<IpcPeer<ClientApi>>();
  private sessionId: string;
  private currentRole: "user" | "agent" = "user";

  constructor(browserManager: BrowserManager, config: FlowebConfig) {
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
    const handlers = {
      ping: () => ({ protocolVersion: 1 }),

      getPages: () => this.browserManager.getPageInfos(),

      getActivePageId: () => this.browserManager.getActivePageId(),

      switchToPage: (pageId: string) => {
        this.logAction("switch_tab", `Switch to ${pageId}`);
        this.browserManager.switchToPage(pageId);
      },

      closePage: (pageId: string) => {
        this.logAction("close_tab", `Close ${pageId}`);
        return this.browserManager.closePage(pageId);
      },

      createSession: (url: string) => {
        this.logAction("navigate", `Open ${url}`);
        return this.browserManager.createSession(this.config, url);
      },

      closeSession: () => {
        this.logAction("close_session", "Session closed");
        return this.browserManager.closeSession();
      },

      resetSessionData: () => {
        clearActions(this.sessionDir());
        this.logAction("reset", "Session data reset");
      },

      getSessionName: () => this.config.sessionName,

      listSessions: () => listSessions(this.config.sessionDir),

      deleteSession: (name: string) => {
        if (name === this.config.sessionName) {
          throw new Error("Cannot delete the active session");
        }
        this.logAction("delete_session", `Delete session ${name}`);
        deleteSessionDir(this.config.sessionDir, name);
      },

      execCode: async (code: string) => {
        const result = await this.browserManager.execCode(code);
        const detail = [code.slice(0, 200), result.output || "(no output)", result.diff || ""]
          .filter(Boolean).join("\n");
        this.logAction("exec", detail);
        return result;
      },
      snapshotActive: async () => {
        const result = await this.browserManager.snapshotActive();
        // renderSnapshot already includes Title + URL, so just use result.text
        this.logAction("snapshot", result.text);
        return result;
      },
      snapshotDiff: async () => {
        const result = await this.browserManager.snapshotDiff();
        this.logAction("snapshot_diff", result.diff || "(no changes)");
        return result;
      },
      evaluate: async (js: string) => {
        const result = await this.browserManager.evaluate(js);
        const json = JSON.stringify(result);
        this.logAction("evaluate", `${js.slice(0, 100)}\n${json.slice(0, 400)}`);
        return result;
      },
      click: (selector: string) => {
        this.logAction("click", selector);
        return this.browserManager.click(selector);
      },
      typeText: (selector: string, text: string) => {
        this.logAction("type", `${text} → ${selector}`);
        return this.browserManager.typeText(selector, text);
      },
      pressKey: (key: string) => {
        this.logAction("press", key);
        return this.browserManager.pressKey(key);
      },
      getSessionMode: () => this.browserManager.getSessionMode(),
      setSessionMode: (mode: string) => {
        this.logAction("session_mode", mode);
        this.browserManager.setSessionMode(mode);
      },
      saveProfile: (domain: string) => {
        this.logAction("save_profile", domain);
        return this.browserManager.saveProfile(domain).then(() => {
          // Persist profile to file
          const profile = this.browserManager.getLastProfile();
          if (profile) {
            const profilesDir = join(this.config.sessionDir, this.config.sessionName, "profiles");
            mkdirSync(profilesDir, { recursive: true });
            writeFileSync(join(profilesDir, `${domain}.json`), JSON.stringify(profile, null, 2));
          }
        });
      },
    };

    const peer = createIpcPeer<ClientApi, DaemonApi>(transport, handlers, {
      onRequest: (msg) => {
        this.currentRole = (msg.meta?.role as "user" | "agent") ?? "user";
      },
    });

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

  private sessionDir(): string {
    return getSessionDir(this.config);
  }

  private logAction(type: string, detail: string): void {
    const role = this.currentRole;
    appendAction(this.sessionDir(), {
      type,
      timestamp: new Date().toISOString(),
      data: { detail },
      role,
    });
    // Broadcast to all connected clients for real-time Browser panel display
    for (const client of this.clients) {
      try {
        void client.call.actionLogged({ type, detail, role });
      } catch {
        // Client may have disconnected
      }
    }
  }

  private persistState(): void {
    try {
      const sessionDir = this.sessionDir();
      writeSessionState(sessionDir, {
        version: 1 as const,
        sessionId: this.sessionId,
        sessionName: this.config.sessionName,
        pid: process.pid,
        pages: this.browserManager.getPageInfos(),
        activePageId: this.browserManager.getActivePageId(),
        startedAt: new Date().toISOString(),
      });

      // Ensure conversations/ subdirectory exists
      const conversationsDir = join(sessionDir, "conversations");
      if (!existsSync(conversationsDir)) {
        mkdirSync(conversationsDir, { recursive: true });
      }
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
