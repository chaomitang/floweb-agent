import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
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
  private observing = false;

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

    // Log user manual interactions (click, type) during observation
    this.browserManager.on(
      BrowserManagerEvents.USER_ACTION,
      (type: string, detail: string) => {
        const prev = this.currentRole;
        this.currentRole = "user";
        this.logAction(type, detail);
        this.currentRole = prev;
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
        this.logAction("switch_tab", pageId);
        this.browserManager.switchToPage(pageId);
      },

      closePage: (pageId: string) => {
        this.logAction("close_tab", pageId);
        return this.browserManager.closePage(pageId);
      },

      createSession: async (url: string) => {
        this.logAction("navigate", url);
        await this.browserManager.createSession(this.config, url);
        // 新会话默认粉色边框，标识 TUI-daemon 连接已就绪
        await this.browserManager.setAgentBorder("pink");
      },

      closeSession: () => {
        this.logAction("close_session", "Session closed");
        return this.browserManager.closeSession();
      },

      resetSessionData: () => {
        clearActions(this.sessionDir());
        this.logAction("reset", "Session data reset");
      },

      recordAction: (type: string, detail: string) => {
        // Explicit user action — force role to "user"
        const prev = this.currentRole;
        this.currentRole = "user";
        this.logAction(type, detail);
        this.currentRole = prev;
      },

      setObservingMode: (observing: boolean) => {
        this.observing = observing;
        for (const client of this.clients) {
          try {
            void client.call.observingChanged(observing);
          } catch { /* */ }
        }
      },

      getObservingMode: () => this.observing,

      loadProfile: async (domain: string) => {
        const profilesDir = join(this.config.sessionDir, this.config.sessionName, "profiles");
        const path = join(profilesDir, `${domain}.json`);
        const raw = await readFile(path, "utf-8");
        const profile = JSON.parse(raw);
        return this.browserManager.loadProfile(profile);
      },

      startIntercept: () => {
        this.browserManager.startIntercept();
      },

      getIntercepted: () => {
        return this.browserManager.getIntercepted();
      },

      auditSite: () => {
        return this.browserManager.auditSite();
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

      compactHTML: () => {
        return this.browserManager.compactHTML();
      },
      execCode: async (code: string) => {
        this.logAction("exec", code);
        const result = await this.guard(() => this.browserManager.execCode(code));
        return result;
      },
      snapshotActive: async () => {
        const result = await this.browserManager.snapshotActive();
        this.logAction("snapshot", result.text);
        return result;
      },
      waitForPageStable: (timeoutMs?: number) => {
        return this.browserManager.waitForStable(timeoutMs);
      },
      snapshotDiff: async () => {
        const result = await this.browserManager.snapshotDiff();
        this.logAction("snapshot_diff", result.diff || "(no changes)");
        return result;
      },
      evaluate: async (js: string) => {
        this.logAction("evaluate", js);
        const result = await this.guard(() => this.browserManager.evaluate(js));
        return result;
      },
      moveCursor: (x: number, y: number) => {
        return this.browserManager.moveCursor(x, y);
      },
      highlightElement: (selector: string) => {
        return this.browserManager.highlightElement(selector);
      },
      setAgentBorder: (color: "pink" | "yellow") => {
        return this.browserManager.setAgentBorder(color);
      },
      click: (selector: string) => {
        this.logAction("click", selector);
        return this.guard(() => this.browserManager.click(selector));
      },
      typeText: (selector: string, text: string) => {
        this.logAction("type", `${text} → ${selector}`);
        return this.guard(() => this.browserManager.typeText(selector, text));
      },
      pressKey: (key: string) => {
        this.logAction("press", key);
        return this.guard(() => this.browserManager.pressKey(key));
      },
      hover: (selector: string) => {
        this.logAction("hover", selector);
        return this.guard(() => this.browserManager.hover(selector));
      },
      scroll: (x: number, y: number) => {
        this.logAction("scroll", `(${x}, ${y})`);
        return this.guard(() => this.browserManager.scroll(x, y));
      },
      screenshot: () => {
        this.logAction("screenshot", "Screenshot taken");
        return this.browserManager.screenshot();
      },
      goBack: () => {
        this.logAction("navigate", "back");
        return this.browserManager.goBack();
      },
      goForward: () => {
        this.logAction("navigate", "forward");
        return this.browserManager.goForward();
      },
      reloadPage: () => {
        this.logAction("navigate", "reload");
        return this.browserManager.reloadPage();
      },
      saveProfile: (domain: string) => {
        this.logAction("save_profile", domain);
        return this.browserManager.saveProfile(domain).then(async (profile) => {
          const profilesDir = join(this.config.sessionDir, this.config.sessionName, "profiles");
          await mkdir(profilesDir, { recursive: true });
          await writeFile(join(profilesDir, `${domain}.json`), JSON.stringify(profile, null, 2));
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

    void peer.call.observingChanged(this.observing);

    // 已有会话时，确保边框可见（TUI-daemon 连接标识）
    if (status === "connected") {
      this.browserManager.setAgentBorder("pink").catch(() => {});
    }
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    await this.browserManager.markApiActionInProgress(true);
    try {
      return await fn();
    } finally {
      await this.browserManager.markApiActionInProgress(false);
    }
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
