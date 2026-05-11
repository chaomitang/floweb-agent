import type { PageInfo } from "../../core/types.js";

// ─── Daemon → Client (methods exposed by the daemon) ─────────────────

export interface DaemonApi {
  ping(): { protocolVersion: number };
  getPages(): PageInfo[];
  getActivePageId(): string | null;
  switchToPage(pageId: string): void;
  closePage(pageId: string): void;
  createSession(url: string): void;
  closeSession(): void;
}

// ─── Client → Daemon (methods exposed by each client, pushed to) ─────

export interface ClientApi {
  pagesChanged(pages: PageInfo[], activePageId: string | null): void;
  sessionStatusChanged(status: string): void;
}

// ─── Fork IPC ready signal ──────────────────────────────────────────

export type DaemonReadyMessage = {
  type: "ready";
  socketPath: string;
};
